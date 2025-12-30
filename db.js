const mysql = require("mysql");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",       
    password: "tiger",       
    database: "studentdb"
});

db.connect((err) => {
    if (err) {
        console.log("Connection Failed: " + err.message);
    } else {
        console.log("MySQL Connected");
    }
});

module.exports = db;