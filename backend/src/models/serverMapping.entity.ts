import { Entity, PrimaryColumn, ManyToOne } from 'typeorm';
import type { Node } from './node.entity';

@Entity()
export class ServerMapping {
  @PrimaryColumn()
  uuid: string;

  @ManyToOne(() => require('./node.entity').Node, (node: any) => node.mappings)
  node: Node;
}