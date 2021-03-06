import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'redis-om';

import { DbService } from '../db/db.service';
import { LocationService } from '../location/location.service';
import { User, userSchema } from './models/user.model';

@Injectable()
export class UserService {
    private _userRepo: Repository<User>;

    constructor(
        private readonly _dbService: DbService,
        private readonly _configService: ConfigService,
        private readonly _locationService: LocationService
    ) {
        this._userRepo = this._dbService.createRepository(userSchema);
        this._userRepo.createIndex();
    }

    /**
     * Adds user data to Redis.
     * @param {string} status - Users status (online/offline)
     * @param {string} avatar - Users avatar URL.
     * @param {string} lastSeen - When the user was last active.
     * @return {User} - Created entity.
     */
    async addUserData({
        userId,
        status,
        avatar,
        lastSeen,
    }: {
        userId: string;
        status: string;
        avatar: string;
        lastSeen: Date;
    }): Promise<User> {
        try {
            return await this._userRepo.createAndSave({ userId, status, avatar, lastSeen });
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Gets user data from Redis.
     * @param {string} ID - User data entity ID.
     * @return {User} - Found User data.
     */
    async getUserData(): Promise<User> {
        const userId = this._configService.get<string>('userId');
        try {
            const user = await this._userRepo.search().where('userId').equals(userId).return.first();
            if (!user)
                return await this.addUserData({
                    userId,
                    status: 'Exploring the new DigitalTwin',
                    avatar: 'default',
                    lastSeen: new Date(),
                });

            return user;
        } catch (error) {
            throw new InternalServerErrorException(error);
        }
    }

    async getUserAvatar(): Promise<string> {
        const myAddress = await this._locationService.getOwnLocation();
        return `http://[${myAddress}]/api/v2/user/avatar/default`;
    }

    /**
     * Updates user data to Redis.
     * @param {UserData} userData - Data to update user data with.
     * @return {string} - Updated user data ID.
     */
    async updateUserData(userData: User): Promise<string> {
        try {
            const userToUpdate = await this.getUserData();
            userToUpdate.status = userData.status;
            userToUpdate.avatar = userData.avatar;
            userToUpdate.lastSeen = userData.lastSeen;
            return await this._userRepo.save(userToUpdate);
        } catch (error) {
            throw new NotFoundException(error);
        }
    }

    /**
     * Adds the avatar path to user data.
     * @param {string} userId - Users ID to add avatar to.
     * @param {string} path - Avatar path.
     * @return {string} - Updated user data ID.
     */
    async addAvatar({ userId, path }: { userId: string; path: string }): Promise<string> {
        try {
            const userToUpdate = await this.getUserData();
            userToUpdate.userId = userId;
            userToUpdate.avatar = path;
            userToUpdate.lastSeen = new Date();
            return await this._userRepo.save(userToUpdate);
        } catch (error) {
            throw new BadRequestException(error);
        }
    }
}
