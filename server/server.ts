require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });
import { Socket } from 'socket.io';
const server = require('express')();

const http = require('http').createServer(server);

const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const serviceAccount = require('./service-account.json');
const admin = require('firebase-admin');
admin.initializeApp({
 credential: admin.credential.cert(serviceAccount)
});

const port = process.env.PORT || 8080;

const db = admin.firestore();

interface ScoreSubmission {
  tokenId: string,
  score: number,
  name: string
}

const submitScore = async ({tokenId, score, name}: ScoreSubmission) => {
 const collection = db.collection('test');
 const ref = collection.doc(tokenId);
 const doc = await ref.get().catch(err => {return {status: 400, error: err}});

 if ('error' in doc) return doc;

 if (!doc.exists || doc.data().score < score) {
   try {
     await ref.set({
       tokenId,
       name,
       score
     });
     return {
       status: 200,
       error: undefined
     }
   } catch (err) {
     return {
       status: 400,
       error: err
     };
   }
 } else {
   return {
     status: 400,
     error: "Score not larger than original"
   }
 }
}

interface Gotchi {
  name: string,
  tokenId: string,
}

const connectedGotchis: {[key: string]: {
  id: string;
  gotchi?: Gotchi;
}} = {};

io.on('connection', function (socket: Socket) {
    const userId = socket.id;
    let timeStarted: Date;

    console.log('A user connected: ' + userId);
    connectedGotchis[userId] = {id: userId};
    console.log(connectedGotchis);

    socket.on('handleDisconnect', () => {
      socket.disconnect();
    })

    socket.on('setGotchiData', (gotchi) => {
      connectedGotchis[userId].gotchi = gotchi;
    })

    socket.on('gameStarted', () => {
      console.log('Game started: ', userId);
      timeStarted = new Date();
    })

    socket.on('gameOver', async ({ score }: { score: number }) => {
      console.log('Game over: ', userId);
      console.log('Score: ', score);

      const now = new Date();
      const dt = Math.round((now.getTime() - timeStarted.getTime())) / 1000;

      const timeBetweenPipes = 2;
      const startDelay = 2; // default=0.2;
      
      const serverScore = dt / timeBetweenPipes - startDelay;
      const errorRange = 0.1; // default=0.03;

      const lowerBound = serverScore * (1 - errorRange);
      const upperBound = serverScore * (1 + errorRange); 

      // if (score >= Math.floor(lowerBound) && score <= upperBound) {
        const highscoreData = {
          score,
          name: connectedGotchis[userId].gotchi.name,
          tokenId: connectedGotchis[userId].gotchi.tokenId
        }
        console.log("Submit score: ", highscoreData);

        try {
          const res = await submitScore(highscoreData);
          if (res.status !== 200) throw res.error;
          console.log("Successfully updated database");
        } catch (err) {
          console.log(err);
        }
      // } else {
      //   console.log("Cheater: ", score, lowerBound, upperBound);
      // }
    })  

    socket.on('disconnect', function () {
      console.log('A user disconnected: ' + userId);
      delete connectedGotchis[userId];
    });
});

http.listen(port, function () {
    console.log(`Listening on - PORT:${port}`);
});
