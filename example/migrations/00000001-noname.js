'use strict';

var Sequelize = require('sequelize');

/**
 * Actions summary:
 *
 * createTable "CarBrands", deps: []
 * createTable "Cars", deps: [CarBrands]
 *
 **/

var info = {
    "revision": 1,
    "name": "noname",
    "created": "2020-04-12T15:49:58.814Z",
    "comment": ""
};

var migrationCommands = [

    {
        fn: "createTable",
        params: [
            "CarBrands",
            {
                "id": {
                    "autoIncrement": true,
                    "primaryKey": true,
                    "allowNull": false,
                    "type": Sequelize.INTEGER
                },
                "name": {
                    "type": Sequelize.STRING
                },
                "isCertified": {
                    "type": Sequelize.BOOLEAN
                },
                "imgUrl": {
                    "type": Sequelize.STRING
                },
                "orderNo": {
                    "type": Sequelize.INTEGER
                },
                "carsCount": {
                    "type": Sequelize.INTEGER
                },
                "createdAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                },
                "updatedAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                }
            },
            {}
        ]
    },

    {
        fn: "createTable",
        params: [
            "Cars",
            {
                "id": {
                    "autoIncrement": true,
                    "primaryKey": true,
                    "allowNull": false,
                    "type": Sequelize.INTEGER
                },
                "name": {
                    "type": Sequelize.STRING
                },
                "carBrandId": {
                    "onDelete": "NO ACTION",
                    "onUpdate": "CASCADE",
                    "references": {
                        "model": "CarBrands",
                        "key": "id"
                    },
                    "allowNull": true,
                    "type": Sequelize.INTEGER
                },
                "createdAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                },
                "updatedAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                }
            },
            {}
        ]
    }
];

var rollbackCommands = [{
        fn: "dropTable",
        params: ["Cars"]
    },
    {
        fn: "dropTable",
        params: ["CarBrands"]
    }
];

module.exports = {
    pos: 0,
    up: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < migrationCommands.length)
                {
                    let command = migrationCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    down: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < rollbackCommands.length)
                {
                    let command = rollbackCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    info: info
};
