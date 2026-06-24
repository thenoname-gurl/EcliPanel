import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
@Index(['planId', 'countryCode'], { unique: true })
export class RegionalPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  planId: number;

  @Column({ length: 2 })
  countryCode: string;

  @Column('float', { default: 0 })
  price: number;
}