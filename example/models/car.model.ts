import {
  Table,
  Model,
  Column,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { CarBrand } from "./car_brand.model";

@Table
export class Car extends Model<Car> {
  @Column
  name: string;

  @ForeignKey(() => CarBrand)
  @Column
  carBrandId: number;

  @BelongsTo(() => CarBrand)
  carBrand: CarBrand;
}
