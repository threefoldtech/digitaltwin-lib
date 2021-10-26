import {
    ContactRequest,
    FileMessageType,
    FileShareMessageType,
    IdInterface,
    MessageBodyTypeInterface,
    MessageInterface,
    MessageTypes,
    StringMessageTypeInterface,
} from '../types';
import Message from '../models/message';
import { getChat, persistChat, saveFile } from './dataService';
import { sendEventToConnectedSockets } from './socketService';
import { determineChatId } from '../routes/messages';
import { UploadedFile } from 'express-fileupload';
import { getChatById } from './chatService';
import contact from '../models/contact';

export const parseMessages = (messages: Array<any>) => messages.map(parseMessage);

export const parseMessage = (msg: any): MessageInterface<MessageBodyTypeInterface> => {
    const type: MessageTypes = <MessageTypes>msg.type;

    // console.log('MESSAGE: ', msg);
    switch (type) {
        case MessageTypes.STRING:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.GIF:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.CONTACT_REQUEST:
            return new Message<ContactRequest>(
                msg.from,
                msg.to,
                <ContactRequest>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.GROUP_UPDATE:
            return new Message<any>(
                msg.from,
                msg.to,
                <any>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.FILE_UPLOAD:
            console.log('File re-upload');
            const url = saveFile(msg.to, msg.id, {
                name: msg.body.name,
                data: msg.body.parsedFile,
            } as UploadedFile);

            return new Message<FileMessageType>(
                msg.from,
                msg.to,
                <FileMessageType>{ filename: msg.body.name },
                new Date(msg.timeStamp),
                msg.id,
                MessageTypes.FILE,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.FILE:
            return new Message<FileMessageType>(
                msg.from,
                msg.to,
                <FileMessageType>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.FILE_SHARE:
            return new Message<FileShareMessageType>(
                msg.from,
                msg.to,
                <FileShareMessageType>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.EDIT:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                <String>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                MessageTypes.EDIT,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.DELETE:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                <String>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                MessageTypes.DELETE,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.QUOTE:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                <String>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                MessageTypes.QUOTE,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
        case MessageTypes.READ:
            return new Message<StringMessageTypeInterface>(
                msg.from,
                msg.to,
                <String>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                MessageTypes.READ,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );

        default:
            return new Message<MessageBodyTypeInterface>(
                msg.from,
                msg.to,
                <String>msg.body,
                new Date(msg.timeStamp),
                msg.id,
                msg.type,
                msg.replies ? [...msg.replies?.map((r: any) => parseMessage(r))] : [],
                msg?.subject,
                msg?.signatures,
                msg?.updated
            );
    }
};
export const editReply = (chatId: IdInterface, newMessage: Message<MessageBodyTypeInterface>) => {
    const chat = getChat(chatId);
    const messageIndex = chat.messages.findIndex(mes => mes.id === newMessage.subject);
    if (messageIndex === -1) {
        return;
    }

    const replyIndex = chat.messages[messageIndex]?.replies?.findIndex(r => r.id === newMessage.id);
    if (replyIndex === -1) {
        return;
    }

    chat.messages[messageIndex].replies[replyIndex].body = newMessage.body;
    chat.messages[messageIndex].replies[replyIndex].updated = new Date();
    persistChat(chat);
};

export const editMessage = (
    chatId: IdInterface,
    newMessage: Message<MessageBodyTypeInterface | Message<MessageBodyTypeInterface>>
) => {
    if (newMessage.subject) {
        editReply(chatId, newMessage);
        return;
    }
    const chat = getChat(chatId);

    switch (newMessage.type) {
        case MessageTypes.DELETE: {
            const index = chat.messages.findIndex(mes => mes.id === newMessage.id);
            chat.messages[index].body = newMessage.body;
            chat.messages[index].type = MessageTypes.DELETE;
            break;
        }

        case MessageTypes.EDIT: {
            const editedMessage = parseMessage(newMessage.body);
            //@todo: error handling when not parsed
            const index = chat.messages.findIndex(mes => mes.id === editedMessage.id);
            chat.messages[index] = editedMessage;
            break;
        }
    }
    persistChat(chat);
};

export const renameShareInChat = (
    shareConfig: FileShareMessageType,
    contacts?: contact[] = [new contact(shareConfig.id, null)]
) => {
    console.log('////////////////////////////////////');

    // console.log(contacts)
    console.log('conts', contacts);
    contacts?.forEach(contact => {
        // contacts?.forEach(contact => console.log('msgs wiht', getChatById('dr15').messages))

        const EVERYCHATID = 'dr15'; // <----- uupdate with foreach over contacts

        console.log(
            getChatById(contact.id)
                .messages.filter(msg => msg.type === 'FILE_SHARE')
                .filter(el => el.body.id === shareConfig.id)
        );
        const referencesToUpdate = getChatById(contact.id)
            .messages.filter(msg => msg.type === 'FILE_SHARE')
            .filter(el => el.body.id === shareConfig.id);
        let updatedChat = getChatById(contact.id);
        console.log('refs', referencesToUpdate);
        console.log('update config', shareConfig);
        // console.log('updated', updatedChat.messages.map(old => referencesToUpdate.find(update => update.id === old.id) || old))

        referencesToUpdate.forEach(msg => (msg.body = shareConfig));
        updatedChat.messages = updatedChat.messages.map(
            old => referencesToUpdate.find(update => update.id === old.id) || old
        );
        console.log('test', shareConfig.id);
        console.log('test2', referencesToUpdate.at(-1).body.id);

        persistChat(updatedChat);

        console.log('-----------------------------------------------');
    });

    // const referencesToUpdate = getChatById(shareConfig.owner.id).messages.filter(msg => msg.type === 'FILE_SHARE').filter(el => el.body.id === shareConfig.id);
    // console.log('RENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMEEEEEEEEEEEEEEEEEEEEEEEEee')
    // console.log(shareConfig, referencesToUpdate)
    // console.log('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEND')
    // referencesToUpdate.forEach(msg => msg.body = shareConfig);
    // let updatedChat = getChatById(shareConfig.owner.id);
    // updatedChat.messages = updatedChat.messages.map(old => referencesToUpdate.find(update => update.id === old.id) || old);
    // persistChat(updatedChat);
};
export const handleRead = (message: Message<StringMessageTypeInterface>) => {
    // console.log('reading');

    let chatId = determineChatId(message);
    const chat = getChat(chatId);

    const newRead = chat.messages.find(m => m.id === message.body);
    const oldRead = chat.messages.find(m => m.id === chat.read[<string>message.from]);

    if (oldRead && newRead && newRead.timeStamp.getTime() < oldRead.timeStamp.getTime()) {
        return;
    }

    chat.read[<string>message.from] = <string>message.body;
    persistChat(chat);
    sendEventToConnectedSockets('message', message);
};
