const { Model, DataTypes } = require('sequelize');
const sequelize = require('../database');

class User extends Model {}
User.init(
  {
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    gitHubToken:{
      type: DataTypes.STRING,
      unique:true
    }
  },
  {
    sequelize,
    modelName: 'User',
  }
);

module.exports = User;