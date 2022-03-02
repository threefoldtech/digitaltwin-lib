import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'redis-om';

import { DbService } from '../../db/service/db.service';
import { EncryptionService } from '../../encryption/service/encryption.service';
import { Key, keySchema, KeyType } from '../models/key.model';

@Injectable()
export class KeyService {
    private _keyRepo: Repository<Key>;

    constructor(
        private readonly _configService: ConfigService,
        private readonly _dbService: DbService,
        private readonly _encryptionService: EncryptionService
    ) {
        this._keyRepo = this._dbService.createRepository(keySchema);
        // this._dbService.createIndex(this.keyRepo);
    }

    /**
     * Updates either private or public key based on the key type.
     * @param {Uint8Array} pk - Private/Public key in Uint8Array format.
     * @param {KeyType} keyType - Identifies a key as public or private.
     * @return {Key} - Created entity.
     */
    async updateKey({ pk, keyType }: { pk: Uint8Array; keyType: KeyType }): Promise<Key> {
        const pkString = this._encryptionService.uint8ToBase64(pk);
        const userId = this._configService.get<string>('userId');
        try {
            return this._keyRepo.createAndSave({ userId, key: pkString, keyType });
        } catch (error) {
            throw new BadRequestException(error);
        }
    }

    /**
     * Gets the public key of user by given ID.
     * @return {Key} - Public key.
     */
    async getPublicKey(): Promise<Key> {
        const userId = this._configService.get<string>('userId');
        try {
            return this._keyRepo
                .search()
                .where('userId')
                .equals(userId)
                .and('keyType')
                .equals(KeyType.Public)
                .returnFirst();
        } catch (error) {
            throw new NotFoundException(error);
        }
    }
}