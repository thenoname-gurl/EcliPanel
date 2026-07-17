import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateVoiceRoom1726000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'voice_room',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'slug', type: 'varchar', length: '32', isUnique: true },
          { name: 'channelId', type: 'int', isNullable: true },
          { name: 'createdById', type: 'int', isNullable: true },
          { name: 'isPrivate', type: 'boolean', default: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('voice_room');
  }
}