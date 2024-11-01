// server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const router = express.Router();
const JWT_SECRET = 'your_jwt_secret_key'; // Секретный ключ для JWT

const app = express();
const PORT = 3000;

// Подключение к MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/taskboard')
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('Connection error', error));

// Middleware для работы с JSON
app.use(express.json());

// Используйте CORS
app.use(cors());

const Desk = require('./models/Desk');
const User = require('./models/User');

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send({ message: 'Access denied. Admins only.' });
    }
    next();
};

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Данные пользователя из токена
        next();
    } catch (error) {
        res.status(401).send({ message: 'Invalid token' });
    }
};

// Маршрут для регистрации
app.post('/register', async (req, res) => {
    try {
        const { nickname, email, password, role } = req.body;

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(req.body.password, 10);


        // Создание нового пользователя
        const user = new User({
            nickname: req.body.nickname,
            email: req.body.email,
            password: hashedPassword,
            role: req.body.role,
            desks: [],
        });

        await user.save();
        res.status(201).send({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error registering user', error });
    }
});

// Маршрут для авторизации
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).send({ message: 'Invalid credentials' });
        }

        // Создаём токен
        const token = jwt.sign(
            { id: user.id, nickname: user.nickname },
            JWT_SECRET,
            { expiresIn: '1h' } // Устанавливаем время жизни токена
        );

        res.status(200).send({ token, message: 'Login successful', user});
    } catch (error) {
        res.status(500).send({ message: 'Error logging in', error });
    }
});

// Пример маршрута, доступного только администраторам
app.delete('/admin-only-route', authMiddleware, adminMiddleware, async (req, res) => {
    // Админская логика
    res.status(200).send({ message: 'This route is accessible only by admins' });
});

// Пример защищённого маршрута
app.get('/protected-route', authMiddleware, (req, res) => {
    res.status(200).send({ message: 'This is a protected route', user: req.user });
});

/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для получения, добавления досок и пользоватеелй друг другу
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/

// Получение всех пользователей с ролью, отличной от "admin"
app.get('/users/non-admins', async (req, res) => {
    try {
        // Находим пользователей, у которых роль не admin, и выбираем только id и email
        const users = await User.find({ role: { $ne: 'admin' } }, 'id email');

        res.status(200).send({ users });
    } catch (error) {
        res.status(500).send({ message: 'Error fetching users', error });
    }
});

// Получение списка всех досок с полями id и name
app.get('/desks', async (req, res) => {
    try {
        // Получаем список всех досок, выбирая только id и name
        const desks = await Desk.find({}, 'id title');

        res.status(200).send({ desks });
    } catch (error) {
        res.status(500).send({ message: 'Error fetching desks', error });
    }
});

// Добавление пользователей на доску по её id
app.post('/desk/:deskId/add-users', async (req, res) => {
    try {
        const { deskId } = req.params;
        const { userIds} = req.body;

        // Находим доску, к которой будут добавлены пользователи
        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }


        // Проходим по каждому userId и добавляем доску в список досок пользователя
        await Promise.all(userIds.map(async (userId) => {
            const user = await User.findOne({ id: userId });
            if (user) {
                // Проверка, чтобы избежать дублирования досок у пользователя
                const userDeskExists = user.desks.some(desk => desk.id === deskId);
                if (!userDeskExists) {
                    user.desks.push({ id: deskId});
                    await user.save();
                }
            }
        }));

        // Сохраняем доску с добавленными пользователями
        desk.users = desk.users.concat(
            userIds.filter(userId => !desk.users.includes(userId))
        );

        await desk.save();

        res.status(200).send({ message: 'Users added to desk successfully'});
    } catch (error) {
        res.status(500).send({ message: 'Error adding users to desk', error });
    }
});


/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для работы с доской
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/

/// Маршрут для создания новой доски
app.post('/desk/create', async (req, res) => {
    try {
        const newDesk = new Desk(req.body);
        await newDesk.save();
        res.status(201).send(newDesk);
    } catch (error) {
        res.status(400).send(error);
    }
});

//метод для получения данных доски по ее ID
app.get('/desk/:deskId', async (req, res) => {
    try {
        const { deskId } = req.params;
        const desk = await Desk.findOne({ id: deskId });

        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        res.status(200).send(desk);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

// Маршрут для удаления доски по её id
app.delete('/desk/:deskId', async (req, res) => {
    try {
        const { deskId } = req.params;
        const deletedDesk = await Desk.findOneAndDelete({ id: deskId });

        if (!deletedDesk) {
            return res.status(404).send({ error: "Desk not found" });
        }

        res.status(200).send({ message: "Desk deleted successfully" });
    } catch (error) {
        res.status(500).send(error);
    }
});

/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для работы с секциями
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/

// Маршрут для добавления секции к доске по её id
app.post('/desk/:deskId/section/create', async (req, res) => {
    try {
        const { deskId } = req.params;
        const desk = await Desk.findOne({ id: deskId });

        if (!desk) {
            return res.status(404).send({ error: "Desk not found" });
        }

        const newSection = {
            id: req.body.id,
            name: req.body.name,
            columns: []
        };

        desk.sections.push(newSection);
        await desk.save();
        res.status(201).send(newSection);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Маршрут для удаления секции на доске
app.delete('/desk/:deskId/section/:sectionId', async (req, res) => {
    try {
        const { deskId, sectionId } = req.params;
        const desk = await Desk.findOne({ id: deskId });

        if (!desk) {
            return res.status(404).send({ error: "Desk not found" });
        }

        const sectionIndex = desk.sections.findIndex(section => section.id === sectionId);

        if (sectionIndex === -1) {
            return res.status(404).send({ error: "Section not found" });
        }

        desk.sections.splice(sectionIndex, 1);
        await desk.save();
        res.status(200).send({ message: "Section deleted successfully" });
    } catch (error) {
        res.status(500).send(error);
    }
});

/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для работы с колонками
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/

// Запрос для добавления новой колонки в указанную секцию
app.post('/desk/:deskId/section/:sectionId/column/create', async (req, res) => {
    try {
        const { deskId, sectionId } = req.params;
        const { title, id } = req.body;

        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        const newColumn = {
            id: req.body.id,
            title: req.body.title,
            cards: []
        };
        section.columns.push(newColumn);
        await desk.save();

        res.status(201).send(newColumn);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

// Запрос для обновления названия колонки
app.put('/desk/:deskId/section/:sectionId/column/:columnId', async (req, res) => {
    try {
        const { deskId, sectionId, columnId } = req.params;
        const { title } = req.body;

        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        const column = section.columns.find(column => column.id === columnId);
        if (!column) {
            return res.status(404).send({ message: 'Column not found' });
        }

        column.title = title; // Обновление названия колонки
        await desk.save();

        res.status(200).send(column);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

// Запрос для удаления колонки из указанной секции
app.delete('/desk/:deskId/section/:sectionId/column/:columnId', async (req, res) => {
    try {
        const { deskId, sectionId, columnId } = req.params;

        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        const columnIndex = section.columns.findIndex(column => column.id === columnId);
        if (columnIndex === -1) {
            return res.status(404).send({ message: 'Column not found' });
        }

        section.columns.splice(columnIndex, 1); // Удаление колонки
        await desk.save();

        res.status(204).send(); // Успешное удаление, без контента
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});


/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для работы с карточками
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/
//Запрос для добавления новой карточки в колонку
app.post('/desk/:deskId/section/:sectionId/column/:columnId/card/create', async (req, res) => {
    try {
        const { deskId, sectionId, columnId } = req.params;
        const { text, assignee, id, description, priority } = req.body;

        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        const column = section.columns.find(column => column.id === columnId);
        if (!column) {
            return res.status(404).send({ message: 'Column not found' });
        }

        const newCard = {
            id: req.body.id,
            text: req.body.text,
            assignee: req.body.assignee,
            description: req.body.description,
            priority: req.body.priority
        };
        column.cards.push(newCard);
        await desk.save();

        res.status(201).send(newCard);
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

//Запрос для удаления нескольких карточек

app.delete('/desk/:deskId/section/:sectionId/column/:columnId/cards', async (req, res) => {
    try {
        const { deskId, sectionId, columnId } = req.params;
        const { cardIds } = req.body; // Ожидается массив id карточек

        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        const column = section.columns.find(column => column.id === columnId);
        if (!column) {
            return res.status(404).send({ message: 'Column not found' });
        }

        // Удаление карточек
        column.cards = column.cards.filter(card => !cardIds.includes(card.id));
        await desk.save();

        res.status(204).send({ message: 'Успешное удаление нескольких карточек' });
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});

//Запрос для перемещения карточки из одной колонки в другую в рамках одной секции

app.put('/desk/:deskId/section/:sectionId/card/move', async (req, res) => {
    try {
        const { deskId, sectionId } = req.params;
        const { cardId, sourceColumnId, targetColumnId } = req.body; // Передаем sourceColumnId и targetColumnId

        // Проверка доски
        const desk = await Desk.findOne({ id: deskId });
        if (!desk) {
            return res.status(404).send({ message: 'Desk not found' });
        }

        // Проверка секции
        const section = desk.sections.find(section => section.id === sectionId);
        if (!section) {
            return res.status(404).send({ message: 'Section not found' });
        }

        // Проверка исходной колонки
        const sourceColumn = section.columns.find(column => column.id === sourceColumnId);
        if (!sourceColumn) {
            return res.status(404).send({ message: 'Source column not found' });
        }

        // Проверка целевой колонки
        const targetColumn = section.columns.find(column => column.id === targetColumnId);
        if (!targetColumn) {
            return res.status(404).send({ message: 'Target column not found' });
        }

        // Поиск карточки в исходной колонке
        const cardToMove = sourceColumn.cards.find(card => card.id === cardId);
        if (!cardToMove) {
            return res.status(404).send({ message: 'Card not found in source column' });
        }

        // Добавляем карточку в целевую колонку
        targetColumn.cards.push(cardToMove);

        // Удаляем карточку из исходной колонки
        sourceColumn.cards = sourceColumn.cards.filter(card => card.id !== cardId);

        // Сохраняем изменения в базе данных
        await desk.save();

        res.status(200).send(cardToMove); // Возвращаем перемещенную карточку для подтверждения
    } catch (error) {
        res.status(500).send({ message: 'Server error', error });
    }
});


/*
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
                                Методы для удобства разработки
-----------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------
*/

//данный метод используется только для теста, чтобы очищать устаревшие данные
app.delete('/desk/delete/all', async (req, res) => {
    try {
        await Desk.deleteMany({});
        res.status(200).send({ message: 'Все доски и их данные успешно удалены.' });
    } catch (error) {
        res.status(500).send({ error: 'Ошибка при удалении всех досок' });
    }
});

// Маршрут для проверки работы сервера
app.get('/', (req, res) => {
    res.send('Hello, Express!');
});


// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
