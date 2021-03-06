import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'redis-om';

import { ApiService } from '../api/api.service';
import { DbService } from '../db/db.service';
import { KeyService } from '../key/key.service';
import { MessageDTO } from '../message/dtos/message.dto';
import { MessageService } from '../message/message.service';
import { stringifyMessage } from '../message/models/message.model';
import { CreateChatDTO } from './dtos/chat.dto';
import { Chat, chatSchema, stringifyContacts, stringifyMessages } from './models/chat.model';

@Injectable()
export class ChatService {
    private _chatRepo: Repository<Chat>;

    constructor(
        private readonly _dbService: DbService,
        private readonly _configService: ConfigService,
        private readonly _apiService: ApiService,
        private readonly _messageService: MessageService,
        private readonly _keyService: KeyService
    ) {
        this._chatRepo = this._dbService.createRepository(chatSchema);
        this._chatRepo.createIndex();
    }

    /**
     * Creates a new chat.
     * @param {string} name - The name of the new chat.
     * @param {Contact[]} contacts - List of chat contacts.
     * @param {Message[]} messages - List of chat messages.
     * @param {string} adminId - Admin ID of the chat.
     * @param {string[]} read - Group of user IDs that have read the last messages in chat.
     * @param {boolean} isGroup - Group chat or not.
     * @param {Message[]} draft - List of draft messages.
     * @return {Chat} - Created entity.
     */
    async createChat({
        chatId,
        name,
        contacts,
        messages,
        acceptedChat,
        adminId,
        read,
        isGroup,
        draft,
    }: CreateChatDTO): Promise<Chat> {
        try {
            return await this._chatRepo.createAndSave({
                chatId,
                name,
                contacts: stringifyContacts(contacts),
                messages: stringifyMessages(messages),
                acceptedChat,
                adminId,
                read,
                isGroup,
                draft: stringifyMessages(draft),
            });
        } catch (error) {
            throw new BadRequestException(`unable to create chat: ${error}`);
        }
    }

    /**
     * Gets chats using pagination.
     * @param offset - Chat offset, defaults to 0.
     * @param count - Amount of chats to fetch, defaults to 25.
     * @return {Chat[]} - Found chats.
     */
    async getChats({ offset = 0, count = 25 }: { offset?: number; count?: number } = {}): Promise<Chat[]> {
        try {
            return await this._chatRepo.search().return.page(offset, count);
        } catch (error) {
            throw new NotFoundException('no chats found');
        }
    }

    /**
     * Gets accepted chats using pagination.
     * @param offset - Chat offset, defaults to 0.
     * @param count - Amount of chats to fetch, defaults to 25.
     * @return {Chat[]} - Found chats.
     */
    async getAcceptedChats({ offset = 0, count = 25 }: { offset?: number; count?: number } = {}): Promise<Chat[]> {
        try {
            return await this._chatRepo.search().where('acceptedChat').true().return.page(offset, count);
        } catch (error) {
            throw new NotFoundException('no accepted chats found');
        }
    }

    /**
     * Gets a chat by its ID.
     * @param {string} chatId - Chat ID.
     * @return {Chat} - Found chat.
     */
    async getChat(chatId: string): Promise<Chat> {
        try {
            return await this._chatRepo.search().where('chatId').eq(chatId).return.first();
        } catch (error) {
            throw new ForbiddenException(`not in contact`);
        }
    }

    /**
     * Gets messages from a chat by given chat Id.
     * @param {string} chatId - Chat Id to get messages from.
     * @param {string|null} from - Optional from sender.
     * @param {number|null} page - Optional page parameter.
     * @param {number} limit - Limit, defaults to 50.
     */
    async getChatMessages({
        chatId,
        from,
        page,
        limit,
    }: {
        chatId: string;
        from: string | null;
        page: number | null;
        limit: number;
    }): Promise<{ hasMore: boolean; messages: MessageDTO<unknown>[] }> {
        const chat = await this.getChat(chatId);
        const parsedMessages = chat.parseMessages();

        let end = parsedMessages.length;
        if (page) end = parsedMessages.length - page * limit;
        else if (from) end = parsedMessages.findIndex(m => m.id === from);

        const start = end - limit;
        return {
            hasMore: start !== 0,
            messages: parsedMessages.slice(start, end),
        };
    }

    /**
     * Deletes a chat by its ID.
     * @param {string} chatID - Chat ID.
     */
    async deleteChat(chatID: string): Promise<void> {
        const chatToDelete = await this.getChat(chatID);
        try {
            return await this._chatRepo.remove(chatToDelete.entityId);
        } catch (error) {
            throw new InternalServerErrorException(`unable to delete contact: ${error}`);
        }
    }

    /**
     * Adds a message to a chat.
     * @param {Chat} chat - Chat to add messages to.
     * @param {Message} message - Signed message to add to chat.
     * @return {string} - Chat entity ID.
     */
    async addMessageToChat({ chat, message }: { chat: Chat; message: MessageDTO<unknown> }): Promise<string> {
        try {
            chat.messages
                ? chat.messages.push(stringifyMessage(message))
                : (chat.messages = [stringifyMessage(message)]);
            return await this._chatRepo.save(chat);
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Removes a contact from a chat.
     * @param {Chat} chat - Chat to remove contact from.
     * @param {string} contactId - Contact to remove.
     */
    async removeContactFromChat({ chat, contactId }: { chat: Chat; contactId: string }) {
        try {
            const contacts = chat.parseContacts().filter(c => c.id !== contactId);
            chat.contacts = stringifyContacts(contacts);
            return await this._chatRepo.save(chat);
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    async handleMessageRead(message: MessageDTO<string>) {
        const chatId = this._messageService.determineChatID(message);
        const chat = await this.getChat(chatId);
        const chatMessages = chat.parseMessages();

        const newRead = chatMessages.find(m => m.id === message.body);
        const oldIdx = chat.read.indexOf(message.from);
        if (oldIdx > -1) {
            const oldRead = chatMessages.find(m => m.id === chat.read[oldIdx]);
            if (!(newRead.timeStamp.getTime() < oldRead.timeStamp.getTime())) {
                chat.read[oldIdx] = message.body;
                return await this._chatRepo.save(chat);
            }
        }
    }

    /**
     * Get the group chat of the admin based on the chatID.
     * @param {string} adminLocation - External admin location to get chat from.
     * @param {string} chatID - Chat ID to fetch from location.
     */
    async syncNewChatWithAdmin({ adminLocation, chatID }: { adminLocation: string; chatID: string }): Promise<Chat> {
        const chat = await this._apiService.getAdminChat({ location: adminLocation, chatID });
        // this._socketService.server.emit('new_chat', chat);
        return await this.createChat(chat);
    }

    /**
     * Send a message to all contacts of a group chat.
     * @param {Chat} chat - Chat to send message to.
     * @param {MessageDTO} message - Message to send.
     */
    async handleGroupAdmin({ chat, message }: { chat: Chat; message: MessageDTO<unknown> }) {
        const contacts = chat.parseContacts();
        const validSignature = await this._messageService.verifySignedMessage({
            isGroup: false,
            adminContact: null,
            fromContact: contacts.find(c => c.id === message.from),
            signedMessage: message,
        });
        if (!validSignature) throw new BadRequestException(`failed to verify message signature`);

        const signedMessage = await this._keyService.appendSignatureToMessage(message);
        const userId = this._configService.get<string>('userId');
        const receivingContacts = contacts.filter(c => c.id !== userId);
        // send in parallel whilst still waiting until all contacts have received the message
        await Promise.all(
            receivingContacts.map(async c => {
                await this._apiService.sendMessageToApi({ location: c.location, message: signedMessage });
            })
        );
    }
}
