import { forwardRef, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { BlockedContactService } from '../blocked-contact/blocked-contact.service';
import { Contact } from '../contact/models/contact.model';
import { KeyService } from '../key/key.service';
import { MessageDTO } from '../message/dtos/message.dto';
import { Message } from '../message/models/message.model';
import { MessageType } from '../message/types/message.type';
import { ChatService } from './chat.service';
import { Chat } from './models/chat.model';

@WebSocketGateway({ cors: '*' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    private server: Server;

    private logger: Logger = new Logger('ChatGateway');

    constructor(
        private readonly _configService: ConfigService,
        private readonly _keyService: KeyService,
        private readonly _blockedContactService: BlockedContactService,
        @Inject(forwardRef(() => ChatService))
        private readonly _chatService: ChatService
    ) {}

    /**
     * TODO: WIP
     * Sends a new incoming message to all connected clients.
     */
    @SubscribeMessage('message')
    async handleIncomingMessage(@MessageBody() { message }: { chatId: string; message: Message }) {
        console.log(`MESSAGE: ${message.type}`);
        // correct from to message
        message.from = this._configService.get<string>('userId');

        // sign message
        const signedMessage = await this._keyService.appendSignatureToMessage(message);

        // get chat data
        const chat = await this._chatService.getChat(`${message.from}-${message.to}`);
        if (!chat) return;

        // set correct chatId to message
        signedMessage.id = message.id;

        if (signedMessage.type === MessageType.READ) {
            this.emitMessageToConnectedClients('message', signedMessage);
            return await this._chatService.handleMessageRead(<MessageDTO<string>>signedMessage);
        }

        // notify contacts about creation of new chat
        this.emitMessageToConnectedClients('message', signedMessage);

        // persist message
        this._chatService.addMessageToChat({ chat, message: signedMessage });
    }

    @SubscribeMessage('block_chat')
    async handleBlockChat(@MessageBody() id: string) {
        console.log(`ID: ${id}`);
        await this._blockedContactService.addBlockedContact({ id });
        this.emitMessageToConnectedClients('chat_blocked', id);
    }

    /**
     * Emits message to connected clients.
     * @param {string} event - Event to emit.
     * @param {unknown} message - Message to send.
     */
    emitMessageToConnectedClients(event: string, message: unknown): void {
        this.server.emit(event, message);
    }

    /**
     * Handles socket initialization.
     * @param {Server} server - socket.io server.
     */
    afterInit(server: Server) {
        this.logger.log(`chat gateway setup successful`);
        this.server = server;
    }

    /**
     * Handles a new socket.io client connection.
     * @param {Socket} client - socket.io client.
     */
    handleConnection(client: Socket): void {
        this.logger.log(`new client connection: ${client.id}`);
    }

    /**
     * Handles a socket.io client disconnection.
     * @param {Socket} client - socket.io client.
     */
    handleDisconnect(client: Socket): void {
        this.logger.log(`client disconnected: ${client.id}`);
    }
}
