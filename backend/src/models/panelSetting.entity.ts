import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity()
export class PanelSetting {
  @PrimaryColumn()
  key: string;

  @Column('text')
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
