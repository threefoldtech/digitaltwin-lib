import * as http from 'http';
import { Socket } from 'socket.io';

import { config } from '../config/config';
import Message from '../models/message';
import { connections } from '../store/connections';
import { contacts } from '../store/contacts';
import { updateLastSeen, updateStatus } from '../store/user';
import { MessageBodyTypeInterface, MessageTypes, StatusUpdate, StringMessageTypeInterface } from '../types';
import { sendMessageToApi, sendStatusUpdate } from './apiService';
import { getChatById, persistMessage } from './chatService';
import { deleteChat, getAllUsers, getBlocklist, persistBlocklist } from './dataService';
import { appendSignatureToMessage } from './keyService';
import { getMyLocation } from './locationService';
import { editMessage, handleRead, parseMessage } from './messageService';

const socketio = require('socket.io');

export let io: Socket;

export const startSocketIo = (httpServer: http.Server) => {
    io = socketio(httpServer, {
        cors: {
            origin: '*',
        },
    });

    io.on('connection', async (socket: Socket) => {
        console.log(`${socket.id} connected`);
        connections.add(socket.id);

        sendEventToConnectedSockets('appID', process.env.DIGITALTWIN_APPID);
        const myLocation = await getMyLocation();
        sendEventToConnectedSockets('yggdrasil', myLocation);
        sendEventToConnectedSockets('blocked_contacts', getBlocklist());

        const users = await getAllUsers();
        sendEventToConnectedSockets('users_loaded', users);

        const status: StatusUpdate = {
            id: config.userid,
            isOnline: true,
        };
        handleStatusEmit({ status });

        socket.on('disconnect', () => {
            console.log(`${socket.id} disconnected`);
            connections.delete(socket.id);
            if (connections.getConnections().length === 0) {
                updateLastSeen();
            }
            status.isOnline = false;
            handleStatusEmit({ status });
        });

        socket.on('message', async messageData => {
            const newMessage: Message<MessageBodyTypeInterface> = parseMessage(messageData.message);
            newMessage.from = config.userid;
            appendSignatureToMessage(newMessage);
            const chat = getChatById(newMessage.to);

            console.log(`internal send message to  ${chat.adminId}`);
            // sendMessage(chat.adminId, newMessage);

            // @todo refactor this
            // connections.getConnections().forEach((connection: string) => {
            // if (connection == socket.id) {
            //     // this is me
            //     return
            // }

            // io.to(connection).emit('message', newMessage);
            // console.log(`send message to socket ${connection}`);
            // });
            const location = chat.contacts.find(c => c.id == chat.adminId).location;

            if (newMessage.type === MessageTypes.READ) {
                handleRead(<Message<StringMessageTypeInterface>>newMessage);
                await sendMessageToApi(location, newMessage);
                return;
            }

            if (newMessage.type !== MessageTypes.SYSTEM) {
                persistMessage(chat.chatId, newMessage);
            }

            await sendMessageToApi(location, newMessage);
        });

        socket.on('update_message', messageData => {
            console.log('updatemsgdata', messageData);
            const newMessage: Message<MessageBodyTypeInterface> = parseMessage(messageData.message);
            editMessage(messageData.chatId, newMessage);
            appendSignatureToMessage(newMessage);
            const chat = getChatById(messageData.chatId);
            const location1 = chat.contacts.find(c => c.id == chat.adminId).location;
            sendMessageToApi(location1, newMessage);
        });
        socket.on('status_update', data => {
            const status = data.status;
            updateStatus(status);
        });
        socket.on('remove_chat', id => {
            const success = deleteChat(id);
            if (!success) {
                return;
            }
            sendEventToConnectedSockets('chat_removed', id);
        });
        socket.on('block_chat', id => {
            const blockList = getBlocklist();
            if (blockList.includes(id)) return;
            blockList.push(id);
            persistBlocklist(blockList);
            sendEventToConnectedSockets('chat_blocked', id);
        });
        socket.on('unblock_chat', (name: string) => {
            persistBlocklist(getBlocklist().filter(b => b != name));
        });
    });
};

export const sendEventToConnectedSockets = (event: string, body: unknown) => {
    connections.getConnections().forEach((connection: string) => {
        io.to(connection).emit(event, body);
        console.log(`send message to ${connection} with event: ${event}`);
    });
};

/**
 * Emits your status (on/offline) to all your contacts.
 * @param {Object} obj - Object.
 * @param {StatusUpdate} obj.status - Updated status.
 */
const handleStatusEmit = ({ status }: { status: StatusUpdate }) => {
    contacts.map(c => sendStatusUpdate({ location: c.location, status }));
};
