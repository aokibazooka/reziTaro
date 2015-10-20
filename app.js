// test
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');

var routes = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// 追加
app.set('port', process.env.PORT || 3000);

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);

// 追加
var server = http.createServer(app);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

var mongoose = require('mongoose');

//localhostのnode_memo_demoのデータベースに接続。
var db = mongoose.connect('mongodb://localhost/kaikei_demo10');
//メモのスキーマを宣言。
var SyouhinSchema = new mongoose.Schema({
    syouhinmei: {
        type: String
    },
    nedan: Number,
    uriagekosu: Number
});
var KounyuSchema = new mongoose.Schema({
    time: {
        type: String
    },
    syouhinId: Number,
    kosu: Number,
    delete: Boolean
});
var indexToId = [];
var kounyuSu = 0;
//スキーマからモデルを生成。
var Syouhin = db.model('syouhin', SyouhinSchema);
var Kounyu = db.model('kounyu', KounyuSchema);

// データベース初期化用
//Syouhin.remove({}, function(err) { 
//   console.log('collection removed') 
//});
//Kounyu.remove({}, function(err) { 
//   console.log('collection removed') 
//});

// 起動時に配列のインデックスとidを結びつける
Syouhin.find(function (err, items) {
    items.forEach(function (item, index) {
        indexToId.push(item._id);
    });
});

server.listen(app.get('port'), function () {
    console.log("Express server listening on port " + app.get('port'));
});

var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {
    Syouhin.find(function (err, items) {
        socket.emit('addSyouhinRe', items);
    });
    Kounyu.find(function (err, items) {
        items.forEach(function (item, index) {
            socket.emit('addKounyuRe', item);
        });
    });
    //syouhinDataは{syouhinmei: Number, nedan: Number}の型
    socket.on('addSyouhin', function (syouhinData) {
        var query = {
            syouhinmei: syouhinData.syouhinmei
        };
        Syouhin.find(query, function (err, items) {
            if (err) {
                console.log(err);
            }
            if (items.length == 0) { //データベースに同じ商品名のものがない場合
                syouhinData.uriagekosu = 0;
                var syouhin = new Syouhin(syouhinData);
                indexToId.push(syouhin._id);
                syouhin.save(function (err) {
                    if (err) {
                        return;
                    }
                    Syouhin.find(function (err, items) {
                        io.sockets.emit('addSyouhinRe', items);
                    });
                });
            } else {
                socket.emit('Error', 0);
            }
        });
    });
    socket.on('addKounyu', function (kounyuData) {
        var kounyu = new Kounyu(kounyuData);
        kounyu.delete = false;
        kounyu.save(function (err) {
            if (err) {
                return;
            }
            io.sockets.emit('addKounyuRe', kounyuData);
        });
        var id = indexToId[kounyuData.syouhinId];
        Syouhin.findOne({
            _id: id
        }, function (err, item) {
            var newUriagekosu = parseInt(item.uriagekosu) + parseInt(kounyuData.kosu);
            item.uriagekosu = newUriagekosu;
            item.save();
            Syouhin.find(function (err, items) {
                io.sockets.emit('addSyouhinRe', items);
            });
        });
    });
    socket.on('sakujo', function(sakujoId){
        Kounyu.findOne({_id: sakujoId}, function(elem){ // IDから検索できない
//            elem.delete = true;
            console.log(elem);
        });
    })
});


module.exports = app;