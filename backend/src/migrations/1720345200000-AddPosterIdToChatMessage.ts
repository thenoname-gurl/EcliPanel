import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPosterIdToChatMessage1720345200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'chat_message',
      new TableColumn({
        name: 'posterId',
        type: 'varchar',
        length: '16',
        isNullable: true,
        charset: 'utf8mb4',
        collation: 'utf8mb4_unicode_ci',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('chat_message', 'posterId');
  }
}