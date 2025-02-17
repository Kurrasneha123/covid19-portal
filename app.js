const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()
const convertDbObjectToStateObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}
const convertDistrictObjectToDbObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

function authenticationToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}
//API 1
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatch === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
//API 2
app.get('/states/', authenticationToken, async (request, response) => {
  const getStateQuery = `
  SELECT 
    * 
  FROM 
    state;`
  const stateArray = await db.all(getStateQuery)
  response.send(
    stateArray.map(eachState => convertDbObjectToStateObject(eachState)),
  )
})
//API 3
app.get('/states/:stateId/', authenticationToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT 
      * 
    FROM 
      state
    WHERE
      state_id = ${stateId}`
  const state = await db.get(getStateQuery)
  response.send(convertDbObjectToStateObject(state))
})
//API 4
app.post(`/districts/`, authenticationToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
    INSERT INTO
      district (state_id, district_name, cases, cured, active, deaths)
    VALUES 
      (${stateId}, '${districtName}', ${cases}, ${cured}, ${active}, ${deaths})`
  await db.run(postDistrictQuery)
  response.send('District Successfully Added')
})
//API 5
app.get(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT 
      * 
    FROM 
      district 
    WHERE 
      district_id = ${districtId}`
    const district = await db.get(getDistrictQuery)
    response.send(convertDistrictObjectToDbObject(district))
  },
)
//API 6
app.delete(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
    DELECTE 
    FROM
    district
    WHERE
      district_id = ${districtId}`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)
//API 7
app.put(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
   UPDATE 
     district
   SET 
     district_name = '${districtName}',
     state_id = ${stateId},
     cases = ${cases},
     cured = ${cured},
     active = ${active},
     deaths = ${deaths}
   WHERE 
     district_id = ${districtId}`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)
//API 8
app.get(
  '/states/:stateId/stats/',
  authenticationToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatesQuery = `
  SELECT 
     SUM(cases),
     SUM(cured),
     SUM(active),
     SUM(deaths)
  FROM 
    district 
  WHERE 
    state_id = ${stateId}`
    const stats = await db.get(getStateStatesQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)
module.exports = app
