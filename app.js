const express = require('express')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const sqlite3 = require('sqlite3')
const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())
let db = null

const initialisedbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB server error:${e.message}`)
    process.exit(1)
  }
}

initialisedbServer()
//following people
const getFollowingPeopleId = async username => {
  const getFollowingPeopleQuery = `
SELECT
following_user_id FROM
follower INNER JOIN user ON user.user_id = follower.follower_user_id
WHERE 
user.usename = ${username} ;`

  const followingPeople = await db.all(getFollowingPeopleQuery)
  const arrayOfId = followingPeople.map(eachuser => eachuser.following_user_id)
  return arrayOfId
}

//authentication Token
const authenticateToken = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (authHeader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}

//Tweet Access Token
const tweetAccessToken = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
  SELECT 
  *
  FROM 
  tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
  WHERE 
   tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${userId};`

  const tweet = await db.all(getTweetQuery)

  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 1 POST
app.post('/register/', async (request, response) => {
  const {name, username, password, gender} = request.body
  console.log(name, username, password, gender)
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const insertUserQuery = `
        INSERT INTO 
        user(name,username,password,gender)
        VALUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
        );`
      const dbResponse = await db.run(insertUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}";`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    console.log(isPasswordMatched)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        userId: dbUser.user_id,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      console.log(payload)
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API-3 GET
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  console.log(username)
  const getTweetsQuery = `
  SELECT 
  user.username,
  tweet.tweet,
  tweet.date_time as dateTime
  FROM
   follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON tweet.user_id = user.user_id 
  WHERE 
  follower.follower_user_id = (
    SELECT 
    user_id
    FROM
    user
    WHERE 
    username = '${username}'
  )
  ORDER BY 
  tweet.date_time DESC
  LIMIT 4;
  `
  const dbResponse = await db.all(getTweetsQuery)
  response.send(dbResponse)
})

//API-4 GET

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  console.log(username)

  const getUserfollowsPeople = `
  SELECT
  user.name
  FROM
  follower INNER JOIN user ON follower.following_user_id = user.user_id
  WHERE 
  follower.follower_user_id = (
    SELECT 
    user_id
    FROM
    user
    WHERE 
    username = '${username}'
  );`
  const dbResponse = await db.all(getUserfollowsPeople)
  response.send(dbResponse)
})

//API-5 GET returns the followers

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  console.log(username)
  const getUserFollowers = `
  SELECT 
  user.name
  FROM 
  follower INNER JOIN user ON follower.follower_user_id = user.user_id
  WHERE 
  follower.following_user_id = (
    SELECT
    user_id
    FROM
    user
    WHERE username = '${username}'  
  );`
  const dbResponse = await db.all(getUserFollowers)
  response.send(dbResponse)
})

//API-6 GET

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  console.log(userId)
  console.log(username)
  const {tweetId} = request.params
  console.log(tweetId)

  const gettweetAuthorId = `
  SELECT 
  user_id
  FROM
  tweet
  WHERE tweet_id = ${tweetId}`
  const tweetAuthorId = await db.get(gettweetAuthorId)
  console.log(tweetAuthorId)

  const checkFollowingQuery = `
  SELECT 
  *
  FROM 
  follower
  WHERE follower_user_id = ${userId} AND following_user_id = ${tweetAuthorId.user_id};`
  const checkFollowingMembers = await db.get(checkFollowingQuery)
  if (checkFollowingMembers !== undefined) {
    const getTweetQuery = `
  SELECT 
  tweet,
  (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies,
  date_time AS dateTime
  FROM tweet
  WHERE 
  tweet.tweet_id = ${tweetId} ;`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7 GET

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username, userId} = request
    console.log(userId)
    console.log(username)
    const {tweetId} = request.params
    console.log(tweetId)

    const gettweetAuthorId = `
  SELECT 
  user_id
  FROM
  tweet
  WHERE tweet_id = ${tweetId}`
    const tweetAuthorId = await db.get(gettweetAuthorId)
    console.log(tweetAuthorId)
    const checkFollowingQuery = `
  SELECT 
  *
  FROM 
  follower
  WHERE follower_user_id = ${userId} AND following_user_id = ${tweetAuthorId.user_id};`
    const checkFollowingMembers = await db.get(checkFollowingQuery)

    if (checkFollowingMembers !== undefined) {
      const getLikesQuery = `
    SELECT 
    username
    FROM
    like INNER JOIN user ON like.user_id = user.user_id
    WHERE 
    tweet_id = ${tweetId};`

      const likes = await db.all(getLikesQuery)
      response.send({
        likes: likes.map(element => element.username),
      })
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username, userId} = request
    console.log(userId)
    console.log(username)
    const {tweetId} = request.params
    console.log(tweetId)

    const gettweetAuthorId = `
  SELECT 
  user_id
  FROM
  tweet
  WHERE tweet_id = ${tweetId}`
    const tweetAuthorId = await db.get(gettweetAuthorId)
    console.log(tweetAuthorId)
    const checkFollowingQuery = `
  SELECT 
  *
  FROM 
  follower
  WHERE follower_user_id = ${userId} AND following_user_id = ${tweetAuthorId.user_id};`
    const checkFollowingMembers = await db.get(checkFollowingQuery)

    if (checkFollowingMembers !== undefined) {
      const repliesQuery = `
    SELECT 
    user.name,reply.reply
    FROM 
    reply INNER JOIN user ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ${tweetId};`

      const replies = await db.all(repliesQuery)

      response.send({
        replies: replies.map(element => ({
          name: element.name,
          reply: element.reply,
        })),
      })
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API -9

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  console.log(userId)
  console.log(username)

  const getTweetsQuery = `
  SELECT 
  tweet_id,tweet,date_time AS dateTime
  FROM
  tweet
  WHERE 
  user_id = ${userId};`

  const tweets = await db.all(getTweetsQuery)

  const getTweetDetails = async tweet => {
    const likesCountQuery = `
  SELECT COUNT(*) AS likes
  FROM
  like
  WHERE
  tweet_id = ${tweet.tweet_id};
  `
    const {likes} = await db.get(likesCountQuery)

    const repliesCountQuery = `
  SELECT COUNT(*) AS replies
  FROM reply 
  WHERE tweet_id = ${tweet.tweet_id};`

    const {replies} = await db.get(repliesCountQuery)

    return {
      tweet: tweet.tweet,
      likes,
      replies,
      dateTime: tweet.dateTime,
    }
  }

  const tweetDetails = await Promise.all(tweets.map(getTweetDetails))
  response.send(tweetDetails)
})

//API-10 POST
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `
  INSERT INTO tweet(tweet,user_id,date_time)
  VALUES(
    '${tweet}',
    ${userId},
    '${dateTime}');`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API-11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request

    const tweetDetailsQuery = `
  SELECT *
  FROM
  tweet
  WHERE 
  tweet_id = ${tweetId} AND user_id = ${userId} ;`

    const deleteTweet = await db.get(tweetDetailsQuery)

    console.log(deleteTweet)

    if (deleteTweet !== undefined) {
      deleteTweetQuery = `DELETE  FROM tweet WHERE tweet_id = ${tweetId};`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
