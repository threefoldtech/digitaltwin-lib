import { Module } from '@nestjs/common';

import { DbModule } from '../db/db.module';
import { YggdrasilModule } from '../yggdrasil/yggdrasil.module';
import { ChatController } from './controller/chat.controller';
import { ChatService } from './service/chat.service';

@Module({
    imports: [DbModule, YggdrasilModule],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule {}
