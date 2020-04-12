import { Table, Model, Column, Default, DataType } from "sequelize-typescript";

@Table
export class CarBrand extends Model<CarBrand> {
  @Column
  name: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isCertified: boolean;

  @Column
  imgUrl: string;

  @Column
  orderNo: number;

  @Column
  carsCount: number;
}
