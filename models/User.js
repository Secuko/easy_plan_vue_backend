const mongoose = require('mongoose');
const uuid = require('uuid'); // Для генерации уникальных id

const userSchema = new mongoose.Schema({
    id: {
        type: String,
        default: uuid.v4, // Уникальный идентификатор
    },
    nickname: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'], // Возможные роли: 'user' и 'admin'
        required: true
    },
    desks: [
        {
            deskId: String,
            role: String
        }
    ]
});

const User = mongoose.model('User', userSchema);
module.exports = User;
