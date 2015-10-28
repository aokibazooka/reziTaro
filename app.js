var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');
var xssFilters = require('xss-filters');

var routes = require('./routes/index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// 追加
app.set('port', process.env.PORT || 3210);

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
app.get('/del', function (req, res, next) {
    res.render('del');
})

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
//var ObjectId = require('mongoose').Schema.ObjectId;
var db = mongoose.connect('mongodb://localhost/kaikei_demo10');
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
var Syouhin = db.model('syouhin', SyouhinSchema);
var Kounyu = db.model('kounyu', KounyuSchema);
var indexToId = [];
var kounyuSu = 0;

//// データベース初期化用
//Syouhin.remove({}, function (err) {
//    console.log('collection removed')
//});
//Kounyu.remove({}, function (err) {
//    console.log('collection removed')
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
    sendSyouhin();
    Kounyu.find(function (err, items) {
        items.forEach(function (item, index) {
            socket.emit('addKounyuRe', item);
        });
    });

    function sendSyouhin() {
        Syouhin.find(function (err, items) {
            items.forEach(function (item) {
                item.syouhinmei = xssFilters.inHTMLData(item.syouhinmei);
            });
            io.sockets.emit('addSyouhinRe', items);
        });
    }
    socket.on('dell', function () {
        Syouhin.remove({}, function (err) {
            console.log('collection removed')
        });
        Kounyu.remove({}, function (err) {
            console.log('collection removed')
        });
        for(h=0; h<indexToId.length; h++){
            indexToId.pop();
        }
        console.log('初期化後のindexToId ' + indexToId.length);
        var kounyuSu = 0;
        Kounyu.find(function (err, items) {
            items.forEach(function (item, index) {
                io.sockets.emit('addKounyuRe', item);
            });
        });
        sendSyouhin();
    });
    socket.on('addSyouhin', function (syouhinData) {
        console.log('届いた商品' + syouhinData.syouhinmei); //OK
        var messageHtml = '';
        var error = 0;

        function addError(str) {
            messageHtml += '<p>' + str + '</p>';
            error = 1;
        }
        if (syouhinData.syouhinmei == "") {
            addError('商品名を入力してください');
        } else if (syouhinData.syouhinmei.length >= 20) {
            addError('商品名は20文字以下にしてください');
        }
        if (syouhinData.nedan == "") {
            addError('値段を入力してください');
        } else if (isNaN(syouhinData.nedan)) {
            console.log(syouhinData.nedan);
            addError('値段には数字を入力してください');
        } else if (syouhinData.nedan < 0 || syouhinData.nedan % 1 != 0) {
            addError('値段は正の整数にしてください');
        }
        if (error == 1) {
            socket.emit('Error', messageHtml);
        } else {
            socket.emit('Error', ''); //クリア
            var query = {
                syouhinmei: syouhinData.syouhinmei
            };
            Syouhin.find(query, function (err, items) {
                if (err) {
                    console.log(err);
                }
                if (items.length != 0) { //データベースに同じ商品名のものがない場合
                    socket.emit('Error', '<p>同じ商品名のものがすでにあります</P>');
                } else {
                    syouhinData.uriagekosu = 0;
                    var syouhin = new Syouhin(syouhinData);
                    indexToId.push(syouhin._id);
                    console.log('indexToId ' + indexToId);
                    console.log('addSyouhinのsyouhindate._id ' + syouhin._id);
                    syouhin.save(function (err) {
                        if (err) {
                            return;
                        }
                        sendSyouhin();
                        Syouhin.find(function (err, items) {
                            items.forEach(function (item) {
                                console.log(item);
                            });
                        });
                    });
                }
            });
        }
    });
    socket.on('addKounyu', function (kounyuData) {
        var kounyu = new Kounyu(kounyuData);
        kounyu.delete = false;
        kounyu.save(function (err) {
            if (err) {
                return;
            }
            io.sockets.emit('addKounyuRe', kounyu);
        });
        var id = indexToId[kounyuData.syouhinId];
        console.log('id' + id);



        Syouhin.find(function (err, items) {
            console.log('syouhin.find内');
            items.forEach(function (item) {
                item.syouhinmei = xssFilters.inHTMLData(item.syouhinmei);
                console.log('商品' + item);
            });
        });


        Syouhin.findById(id, function (err, item) {
            console.log('syouhin' + item);
            var newUriagekosu = parseInt(item.uriagekosu) + parseInt(kounyuData.kosu);
            item.uriagekosu = newUriagekosu;
            item.save();
            sendSyouhin();
        });
    });
    socket.on('sakujo', function (sakujoId) {
        Kounyu.findById(sakujoId, function (err, kounyuData) {
            kounyuData.delete = true;
            kounyuData.save(function (err) {
                if (err) {
                    return;
                }
                io.sockets.emit('deleteRe', sakujoId);
                var id = indexToId[kounyuData.syouhinId];
                Syouhin.findById(id, function (err, item) {
                    var newUriagekosu = parseInt(item.uriagekosu) - parseInt(kounyuData.kosu);
                    item.uriagekosu = newUriagekosu;
                    item.save();
                    sendSyouhin();
                });
            });
        });
    });
    socket.on('hukkatu', function (hukkatuId) {
        Kounyu.findById(hukkatuId, function (err, kounyuData) {
            kounyuData.delete = false;
            kounyuData.save(function (err) {
                if (err) {
                    return;
                }
                io.sockets.emit('hukkatuRe', hukkatuId);
            });
            var id = indexToId[kounyuData.syouhinId];
            Syouhin.findById(id, function (err, item) {
                var newUriagekosu = parseInt(item.uriagekosu) + parseInt(kounyuData.kosu);
                item.uriagekosu = newUriagekosu;
                item.save();
                sendSyouhin();
            });
        });
    });
});

module.exports = app;