import { IdInterface, UserInterface } from '../types/index';
import { config } from '../config/config';
import fs from 'fs';
import Chat from '../models/chat';
import { parseFullChat, parsePartialChat } from './chatService';
import { uniqBy } from 'lodash';
import im from 'imagemagick';
import { ITokenFile } from '../store/tokenStore';
import PATH from 'path';
import { UploadedFile } from 'express-fileupload';

export const getChatIds = (): IdInterface[] => {
    const location = config.baseDir + 'chats';
    const locations = fs.readdirSync(location);
    console.log(locations);
    return locations;
};

export const getChat = (id: IdInterface, messagesAmount: number | undefined = undefined): Chat => {
    const path = config.baseDir + `chats/${id}/chat.json`;
    const chat: Chat = <Chat>JSON.parse(fs.readFileSync(path).toString());
    return messagesAmount === undefined
        ? parseFullChat(chat)
        : parsePartialChat(chat, messagesAmount);
};

export const getTokenFile = (): ITokenFile => {
    return JSON.parse(fs.readFileSync(PATH.join(config.baseDir, '/user', '/tokens.json')).toString());
};

export const saveTokenFile = (tokens: ITokenFile) => {
    fs.writeFileSync(PATH.join(config.baseDir, '/user', '/tokens.json'), JSON.stringify(tokens, null, 4), {
        flag: 'w',
    });
}

export const getUserdata = () => {
    const location = config.baseDir + 'user/userinfo.json';
    try {
        const data = JSON.parse(fs.readFileSync(location).toString());
        return data;
    } catch {
        throw new Error('Userinfo file doesn\'t exitst');
    }
};

export enum Key {
    Public = 'publicKey',
    Private = 'privateKey'
}

export const saveKey = (key: string, keyName: Key, force = false) => {
    if (force || !fs.existsSync(config.baseDir + 'user/' + keyName)) {
        fs.writeFileSync(config.baseDir + 'user/' + keyName, key);
    }
};

export const getKey = (keyName: string): string => {
    try {
        return fs.readFileSync(config.baseDir + 'user/' + keyName, 'utf8');
    } catch (ex) {
        if (ex.code === 'ENOENT') {
            console.log(keyName + ' not found!');
        }
        throw ex;
    }
};

const sortChat = (chat: Chat) => {
    const messages = uniqBy(chat.messages, m => m.id);

    messages.map(m => {
        const replies = uniqBy(m.replies, r => r.id);
        replies.sort((a, b) => a.timeStamp.getTime() - b.timeStamp.getTime());
        m.replies = replies;
    });

    messages.sort((a, b) => a.timeStamp.getTime() - b.timeStamp.getTime());

    chat.messages = messages;

    return chat;
};

export const persistChat = (chat: Chat) => {
    const sortedChat = sortChat(chat);

    const path = config.baseDir + `chats/${sortedChat.chatId}`;

    try {
        fs.statSync(path);
    } catch {
        fs.mkdirSync(path);
        fs.mkdirSync(path + '/files');
    }
    fs.writeFileSync(path + '/chat.json', JSON.stringify(sortedChat, null, 4), {
        flag: 'w',
    });
};
export const deleteChat = (chatId: string) => {
    const path = config.baseDir + `chats/${chatId}`;

    try {
        fs.rmdirSync(path, { recursive: true });
    } catch (e) {
        console.log(e);
        return false;
    }
    return true;
};

export const persistUserdata = (userData: UserInterface) => {
    const userdata = JSON.stringify(userData, null, 4);
    const location = config.baseDir + 'user/userinfo.json';
    fs.writeFileSync(location, userdata, { flag: 'w' });
    return;
};

export const saveFile = (
    chatId: IdInterface,
    messageId: string,
    file: UploadedFile
) => {
    let path = `${config.baseDir}chats/${chatId}/files/${messageId}`;
    fs.mkdirSync(path);
    path = `${path}/${file.name}`;
    if(file.tempFilePath && file.mv) {
        file.mv(path)
    } else if(file.data) {
        fs.writeFileSync(path, file.data);
    }
    return path;
};

export const saveAvatar = async (file: UploadedFile, id: string) => {
    const path = `${config.baseDir}user/avatar-${id}`;
    const tempPath = `${config.baseDir}user/temp-avatar-${id}`;
    await file.mv(tempPath)
    await resizeAvatar(tempPath, path);
    fs.unlinkSync(tempPath);
};

export const deleteAvatar = (id: string) => {
    fs.unlinkSync(`${config.baseDir}user/avatar-${id}`);
};

export const resizeAvatar = async (from: string, to: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
        im.resize({
            srcPath: from,
            dstPath: to,
            width: 64,
        }, (err: Error, result) => {
            if (err) {
                reject(err);
            }
            resolve(result);
        });
    });

};

export const persistBlocklist = (blockList: string[]) => {
    const location = config.baseDir + 'user/blockList.json';
    fs.writeFileSync(location, JSON.stringify(blockList, null, 4), {
        flag: 'w',
    });
    return;
};

export const getBlocklist = (): string[] => {
    const location = config.baseDir + 'user/blockList.json';
    try {
        return JSON.parse(fs.readFileSync(location).toString());
    } catch {
        return [];
    }
};
