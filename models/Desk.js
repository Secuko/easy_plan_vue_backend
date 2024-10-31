const mongoose = require('mongoose');

// Схема для карточек задач
const cardSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  assignee: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  description: String,
  priority: Number
});

// Схема для колонок в спринте
const columnSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  cards: [cardSchema]
});

// Схема для секций
const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  columns: [columnSchema]
});

const deskSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    sections: [sectionSchema],
    users: { type: [String], required: true } // Добавляем поле users
  });

module.exports = mongoose.model('Desk', deskSchema);
