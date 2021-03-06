var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var cors = require('cors');
var GoogleStrategy = require('passport-google-oauth2').Strategy;
var passport = require('passport');
var session = require('express-session')
var User = require('../DB/users/userModel')


// Config

// use sessions to store login
app.use(session({secret: "abstractedChalupas", cookie: {}, resave: false, saveUninitialized: false }));
// use cors to send requests to google
app.use(cors());
// use passport
app.use( passport.initialize());
// store passport authentication in the session
app.use( passport.session());

app.use(express.static(__dirname+"/../client"));

// Connect to a Mongo database called we-tube
mongoose.connect('mongodb://localhost/we-tube');

// "1082022701969-rdl6108k798kf2apth302dcuornld9pg.apps.googleusercontent.com"

/* GOOGLE AUTHENTICATION */

var GOOGLE_CLIENT_ID = "1082022701969-rdl6108k798kf2apth302dcuornld9pg";
var GOOGLE_CLIENT_SECRET = "rf5SxZAdcpha9sNXcN-QD3uq";
var rooms = [];

// identify which property defines user. this is the users google profile id
passport.serializeUser(function(user, done) {
  done(null, user.id);
});


//find using one proprety in the schema
passport.deserializeUser(function(user, done) {
  // var userRecord = mongoose query for user based on obj
  // if error, then call done(err);
  // obj should be the user record plucked from database
  User.findOne({'id': user},function(err, record) {
    if (err) {
      return err;
    }
    done(null, record);
  })
  // done(null, user);
});

passport.use(new GoogleStrategy({
  clientID: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  callbackURL: "http://127.0.0.1:8001/auth/google/callback",
  passReqtoCallback: true
  },
  function (request, accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    // check for users in database here, if the database doesnt have that user, add them as a usermodel in mongo
    User.findOne({'id':profile.id}, function (err, record){
      if (err){
        return err;
      }
      // if the record exists and is found, return it
      if (record) {
        return done(null, record);
      }
      else {
        // if the user record does not exist, add them to the database!
        record = {'id': profile.id, 'username': profile.name.givenName, 'email': profile.email, 'photo': profile.photos[0].value}
        User.create(record, function (err, record) {
          if (err) {
            throw err;
          }
          // After successfully adding the use, return the created user record
          return done(null, record);
        })
      }
    });
  });
  }
));

// API Routes
app.get('/api/loggedin', function (req, res) {
  var auth = req.isAuthenticated();
  if (auth) {
    res.send(req.user);
  }
  else
    res.send('0');
})

app.get('/api/logout', function (req, res) {
  req.logout();
  res.redirect('/#stream');
})


app.get('/auth/google', passport.authenticate('google', {scope: [
        'https://www.googleapis.com/auth/plus.login',
        'https://www.googleapis.com/auth/plus.profile.emails.read']
}));

app.get('/streams/rooms', function(req, res){
  res.send(rooms)
})

app.get('/auth/google/callback',
        passport.authenticate( 'google', {
          successRedirect: '/#/stream',
          failureRedirect: '/#/login'
}));


var PORT = 8001;

var io = require('socket.io').listen(app.listen(PORT));

io.on('connection', function (socket) {
  var connectedClients = [];
  connectedClients.push(socket);
  socket.emit('playerDetails', {'videoId': 'TRrL5j3MIvo',
             'startSeconds': 5,
             'endSeconds': 60,
             'suggestedQuality': 'large'});

  socket.on('createRoom', function(data) {
    rooms.push({room : data.room, roomTitle : data.roomTitle});
    // console.log("creating room", rooms);
    //joining room
    socket.join(data.room);
  })

  socket.on('joinRoom', function(data) {
    socket.join(data.room);
    io.to(data.room).emit('newViewer', data);
  });
  //on hearing this event the server return sync data to all viewers
  socket.on('hostPlayerState', function (data) {
    // console.log(data.room, "hostPlayerSync");
    io.to(data.room).emit('hostPlayerSync', data);
    //socket.broadcast.emit('hostPlayerSync', data)
  });

  socket.on('newMessage', function (data) {
    // console.log(data);
    io.to(data.room).emit('newMessage', data);
    // socket.broadcast.emit('newMessage', data)
  });

  socket.on('clientPlayerStateChange', function(data) {
    // console.log('client changed state!, server broadcast', data.stateChange);
    io.to(data.room).emit('serverStateChange', data.stateChange);
    // socket.broadcast.emit('serverStateChange', data.stateChange);
  });
});




module.exports = app;