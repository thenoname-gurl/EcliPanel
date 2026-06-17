import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateVisualEditorTables1718000000000 implements MigrationInterface {
  name = 'CreateVisualEditorTables1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'visual_editor_blueprint',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'userId', type: 'int', isNullable: false },
          { name: 'name', type: 'text', isNullable: false },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'projectData', type: 'longtext', isNullable: false },
          { name: 'latestGeneratedCode', type: 'longtext', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'visual_editor_blueprint',
      new TableIndex({ columnNames: ['userId'] })
    );

    await queryRunner.createTable(
      new Table({
        name: 'visual_editor_library',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'userId', type: 'int', isNullable: false },
          { name: 'name', type: 'text', isNullable: false },
          { name: 'blocksData', type: 'longtext', isNullable: false },
          { name: 'description', type: 'longtext', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'visual_editor_library',
      new TableIndex({ columnNames: ['userId'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('visual_editor_library', true);
    await queryRunner.dropTable('visual_editor_blueprint', true);
  }
}
