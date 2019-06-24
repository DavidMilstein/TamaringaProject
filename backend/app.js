const express = require('express');
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const bcrypt = require("bcryptjs"); //move later to routes/users
const User = require("./models/users");
const Playlist = require("./models/playlist");
const Record = require("./models/records");
const jwt = require('jsonwebtoken');
const checkAuth = require("./middleware/check-auth"); //just pass the refernce to that funtion (and not execute) and Express will execute for us
const Research = require("./models/research");
const similarity = require('compute-cosine-similarity');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

//console.log(process.env);
//console.log(process.env.MONGO_ATLAS_PW);

mongoose.connect("mongodb+srv://david:" + process.env.MONGO_ATLAS_PW + "@cluster0-bo1pz.mongodb.net/Tamaringa", {useNewUrlParser: true})
    .then(() => {
        console.log("Connected to database!");
    })
    .catch(() => {
        console.log("Connection to database failed");
    });
mongoose.set('useCreateIndex', true);

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, DELETE, OPTIONS"
    );
    next();
});

//save user to the DB
app.post("/api/user/signup", async (req, res) => {
    //once the hash func is done, we get the hash param and then inside the then block we create a new user
    // bcrypt.hash(req.body.password, 10)
    //   .then(hash => {

    /* find the songs according to the twenties year of the user,
    what country he come from and sorting the results by youtube views */
    const records = await Record.find({
        year: {$gt: req.body.year - 3, $lt: req.body.year + 3},
        country: req.body.country
    }).sort({'youtube.views': -1}).limit(30);

    // create a user schema
    const user = new User({
        fullName: req.body.fullName,
        id: req.body.id,
        age: req.body.age,
        year: req.body.year,
        country: req.body.country,
        password: req.body.password,
        group: req.body.country + req.body.year,
        entrances: 0,
        songs: [],
        isVoted: false
    });
    let saveUSer = await user.save(); //we have to handle this promise
    // let saveUSer = user.save()
    //     .catch(err => {
    //         res.status(500).json({
    //             message: "Invalid authentication credentials!" + err
    //         });
    //     });
    // console.log(saveUSer);
    if (!saveUSer) {
        return res.status(500).json({
            message: "Invalid authentication credentials!"
        });
    }
    // build the playlist schema
    const playlist = {
        name: saveUSer.group,
        year: req.body.year,
        country: req.body.country,
        records: records
    };

    // console.log('playlist:\n', playlist, '\n\n');

    const query = {name: playlist.name};
    const update = playlist;
    const options = {upsert: true, new: true, setDefaultsOnInsert: true,  useFindAndModify: false};

    let playlistIsExist = true;

    let playlistFound = await Playlist.findOne({name: playlist.name});
    // playlist ins't found, then create new one.
     // console.log('playlistFound1:\n', playlistFound,'\n\n');

    if (!playlistFound) {
        playlistIsExist = false;
    }
    // playlist is isn't exist, create a new playlist document according to the playlist scheme we build above
    if (!playlistIsExist) {
        playlistFound = await Playlist.findOneAndUpdate(query, update, options);
        if (!playlistFound) {
            return res.status(404).json({
                message: "Playlist isn't found for your user"
            });
        }
    }
    // console.log('playlistFound2:\n', playlistFound, '\n\n');

    res.status(201).json({
        user: saveUSer,
        playlist: playlistFound,
    });
});
// ======================test login==========================

app.post("/api/user/login", async (req, res) => {

    const user = await User.findOne({id: req.body.id});
    // console.log("user:\n", user, "\n\n");
    // console.log("FullName:\n", user.fullName, "\n\n");

    if (!user) {
        return res.status(401).json({
            message: "User is not found!"
        });
    }
    if (user.password !== req.body.password) {
        return res.status(401).json({
            message: "Invalid authentication credentials!1"
        });
    }
    const isUserVoted = user.isVoted;
    let firstEntranceFlag = false;
    if (user.entrances === 0) {
        firstEntranceFlag = true;
    }

    const playlist = await Playlist.findOne({name: user.group});
    if (!playlist) {
        return res.status(401).json({
            message: "playlist is not found!"
        });
    }

    const token = await jwt.sign(
        {id: user.id, userId: user._id},
        process.env.JWT_KEY,
        {expiresIn: "1h"}
    );



     // ===================================================================================
     // ===================================================================================
     // ===================================================================================
    console.log("user.entrances\n", user.entrances, "\n\n");

    // Return and update the user best song, the recommended user best songs and the unseen user song
    // enter only if the user is already voted for any song.
    if (!firstEntranceFlag && isUserVoted)
    {
        console.log("1");
        const id = req.body.id;
        Playlist.find({name: user.group}).exec(async function (err, docs) {
            console.log("records.votes.userId\n", docs, "\n\n");
            if (err) {
                console.log("records.votes.userId\n", err, "\n\n");
                return res.status(401).json({
                    message: "playlist is not found!"
                });
            }

            var topUser = [];
            var notEar = [];
            docs[0].records.forEach(function callback(currentValue, index, rec) {
                var index = index;
                var o = currentValue.votes.filter(x => x.userId == id);
                var ex = currentValue.votes.findIndex(x => x.userId == id);
                //console.log(rec);
                //console.log("rec\n",rec,"\n\n");
                if (ex != -1) {
                    //console.log(rec[index]);
                    //console.log(index);
                    //console.log(currentValue.votes.filter(x=>x.userId == id));
                    //console.log(currentValue.votes.findIndex(x=>x.userId == id));
                    topUser.push({
                        index: index,
                        vote: o[0].vote,
                        mbid: rec[index].mbid,
                        artist: rec[index].artist[0].name,
                        title: rec[index].title,
                        videoId: rec[index].youtube.videoId
                    });
                } else {
                    notEar.push({
                        index: index,
                        vote: 0,
                        mbid: rec[index].mbid,
                        artist: rec[index].artist[0].name,
                        title: rec[index].title,
                        videoId: rec[index].youtube.videoId
                    });
                }
            });
            topUser.sort(function (a, b) {
                return b.vote - a.vote;
            });

            var topUsers = [];
            if (docs[0].similarity.length != 0) {
                docs[0].similarity.forEach(function callback(currentValue, index, rec) {
                    if (currentValue.user1 == id || currentValue.user2 == id) {
                        //console.log(currentValue);
                        topUsers.push({
                            user1: currentValue.user1,
                            user2: currentValue.user2,
                            similarity: currentValue.similarity
                        });
                    }
                });
                topUsers.sort(function (a, b) {
                    return b.similarity - a.similarity;
                });

                //console.log(topUser);
                //console.log(topUsers);
                //topUsers = topUsers[0];
                console.log('topUsers:\n',topUsers, '\n\n');
                console.log('topUsers[0]:\n',topUsers[0], '\n\n');
                let recUser;
                if (id == topUsers[0].user1) {
                    console.log("14");
                    recUser = topUsers[0].user2;
                } else {
                    recUser = topUsers[0].user1;
                }
                //console.log(recUser);
                var recSongs = [];
                docs[0].records.forEach(function callback(currentValue, index, rec) {
                    var ind = index;
                    var o = currentValue.votes.filter(x => x.userId == recUser);
                    var ex = currentValue.votes.findIndex(x => x.userId == recUser);
                    if (ex != -1) {
                        //console.log(rec[index]);
                        //console.log(o);
                        //console.log(ex);
                        recSongs.push({
                            index: index,
                            vote: o[0].vote,
                            mbid: rec[index].mbid,
                            artist: rec[index].artist[0].name,
                            title: rec[index].title,
                            videoId: rec[index].youtube.videoId
                        });
                    }
                });
                //console.log(recSongs);
                recSongs.sort(function (a, b) {
                    return b.vote - a.vote;
                });
            }

            //console.log(recSongs);
            var obj = [{topUser, recSongs, notEar}];
            console.log("obj\n", obj, "\n\n");
            user.entrances += 1;
            await user.save();
            res.status(200).json({
                err: false,
                items: [].concat(obj),
                token: token,
                expiresIn: 3600,
                userDbId: user._id,
                userId: user.id,
                userName: user.fullName,
                playlist: playlist,
                country: user.country,
                age: user.age,
                entrance: user.entrances,
                isVoted: user.isVoted
            });
        });
    }

    // ===================================================================================
    // ===================================================================================
    // ===================================================================================

    // first user's login or admin/researcher login
    if (firstEntranceFlag || !isUserVoted) {
        console.log("2");
        user.entrances += 1;
        await user.save();
        res.status(200).json({
            token: token,
            expiresIn: 3600,
            userDbId: user._id,
            userId: user.id,
            userName: user.fullName,
            playlist: playlist,
            country: user.country,
            age: user.age,
            entrance : user.entrances,
            isVoted: user.isVoted
        });
    }
});

app.get("/api/user/users", async (req, res) => {

    const users = await User.find();
    res.status(200).json({
      message: "users fetched successfully",
      users: users,
    });
});

/** -------------------------------------------------------------------------
 * Add a new research to the database
 * @PARAM {String*} id: Given research id
 * @PARAM {String*} name: Given research name
 * @PARAM {String*} process: Given research process
 * @PARAM {String*} variables: Given research variables
 * @PARAM {Date*} startDate: Given research startDate
 * @PARAM {Date*} endDate: Given research endDate
 */



app.post("/api/researcher/new-research", async (req, res) => {
    // console.log("id1: ", req.body.id);
    const research = await new Research({
        name: req.body.name,
        id: req.body.id,
        participants: req.body.participants,
        process: req.body.process,
        variables: req.body.variables,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
    });
    console.log(research);
    research.save();
    res.status(201).json({
        message: 'Research created!',
        researchId: result._id //we send the result data so we can see what's inside there
    });
});

/** -------------------------------------------------------------------------
 * Return an object of all the researches
 *  @PARAM {Object*} researches: researches array
 */
app.get("/api/researcher/new-research", async (req, res) => {
    const document = await Research.find();
    // console.log(documents);
    // console.log('type:' + typeof (documents));
    res.status(200).json({
        message: "Researches fetched successfully",
        researches: document
    });
    // console.log('document: ', document);
});

/** -------------------------------------------------------------------------
 * Delete a specific research by ID
 *  @PARAM {String*} _id: Given research id
 */
app.delete("/api/researcher/new-research/:id", async (req, res, next) => {
    const result = await Research.deleteOne({_id: req.params.id});
        // console.log(result);
        res.status(200).json({message: "Research deleted"});
    });

app.get("/api/user/:id/youtube/:ytid/rate/:n", async (req, res) => {
    const usersId = req.params.id;
    const user = await User.findOne({id: usersId});
    if (!user) {
        return res.status(401).json({
            message: "User is not found!"
        });
    }

    // console.log(req.params.ytid);
    const record = await Record.findOne({"youtube.videoId": req.params.ytid});
    const mbId = record.mbId;
    const usersVote = req.params.n;

    // console.log('user:\n', user, '\n\n================================\n');

    // user.songs.id = usersId;
    // user.songs.mbid = mbId;
    // user.songs.vote = usersVote;
    const obj = {
        songs: JSON.stringify({
            id: usersId,
            mbid: mbId,
            vote: usersVote
        })
    };
    user.songs = JSON.parse(obj.songs);

    // console.log('user:\n', user, '\n\n================================\n');

    var bulk = User.collection.initializeOrderedBulkOp();
    bulk.find({
        id: user.id                 //update the id , if have - update. else - build new document
    }).upsert().updateOne(user);
    bulk.execute(function (err, BulkWriteResult) {
        if (err) return next(err);
        // do cosine similarity calc in 2 minutes
        // loop all songs
        var data = user.songs[0];
        // console.log('data mbid:\n', data.mbid, '\n\n');
        var group = user.group;
        //console.log('group:\n', group, '\n\n');
        //
        // const playlist = await Playlist.findOne({name: user.group});
        //
        // var lookup = {'name': group, 'records.mbid': data.mbid};
        // "q" holds the return obj - playlist document found
        Playlist.findOne({name: user.group, 'records.mbId': user.songs[0].mbid}).exec(async function (err, q) {
            // if (err) return next(err);
            console.log('q:\n', q, '\n\n');
            console.log('err:\n', err, '\n\n');
            console.log('data mbid:\n', data.mbid, '\n\n');

            // return the index of the song in the records obj arr
            const pos = q.records.findIndex(e => e.mbId === data.mbid);
            q.records[pos].votes = q.records[pos].votes || [];

            const posUser = q.records[pos].votes.findIndex(e => e.userId === data.id);
            //console.log('posUser:\n', posUser, '\n\n');

            // check if first user's vote for the voted song and then update the voting data
            if (posUser >= 0) {
                q.records[pos].votes[posUser].vote = data.vote
            } else {
                q.records[pos].votes.push({userId: data.id, vote: data.vote})
            }
            const userArr = []; // array of all votes per records. for example: [0,0,2,0,5,1,5,0...]
            const users = []; //array of users that share your playlist
            q.records.forEach(rec => {
                // למה המערך לא מופיע בסדר הנכון? אחרי שמצביעים
                userArr.push(rec.votes.filter(x => x.userId === data.id).map(x => x.vote)[0] || 0);
                rec.votes.map(function (x) {
                    if (users.indexOf(x.userId) === -1 && x.userId !== data.id) {
                        users.push(x.userId)
                    }
                });
            });
            console.log('userArr:\n', userArr, '\n\n');
            console.log('users:\n', users, '\n\n');


            users.forEach(u => {
                const votesByUser = [];
                q.records.forEach(rec => {
                    votesByUser.push(rec.votes.filter(x => x.userId === u).map(x => x.vote)[0] || 0)
                });
                q.similarity = q.similarity || [];
                const pos = q.similarity.findIndex(x => x.u1 === u && x.u2 === data.id || x.u2 === u && x.u1 === data.id);
                //console.log(pos);
                if (pos >= 0) {
                    q.similarity[pos].similarity = similarity(userArr, votesByUser);
                } else {
                    q.similarity.push({u1: u, u2: data.id, similarity: similarity(userArr, votesByUser)})
                }
            });
            console.log('q.similarity:\n', q.similarity, '\n\n');
            q.markModified('similarity');
            user.isVoted = true;
            await user.save();
            q.save(function (err) { // Mongoose will save changes to `similarity`.
                if (err) return next(err);
                res.json({
                    message: 'cool man',
                });

            })
        });
    });

    // res.status(200).json({
    //     user: user,
    // });
});

module.exports = app;


