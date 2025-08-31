const express = require('express');
const eventRoutes = require('./api/events/event.routes');
const insightRoutes = require('./api/insights/insight.routes');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/events', eventRoutes);
app.use('/api/insights', insightRoutes);

app.get('/', (req, res) => {
  res.send('Chronologicon Engine is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});