const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Session = require('../models/Session');
const {createAccessToken, createRefreshToken, createCookie} = require("../middlewares/createToken")
require('dotenv').config();
const axios = require('axios');


exports.userData = async (req,res) =>{
  const user = req.user

  const userData = await User.findByPk(req.user.id)
  const userComments= await Comment.findAll({
    where:{
      UserId:req.user.id
    }
  })

  res.status(200).json({userData, userComments})
    
}
exports.register= async (req, res) =>{
  try {
    const checkUser = await User.findOne({where:{ email: req.body.email}})
    if(!checkUser){
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const user = await User.create({
        username: req.body.username,
        email: req.body.email,
        password: hashedPassword
      });
      res.status(201).json({ username: 'User Created.' });
    }else{
      res.status(409).json({ username: 'Email already registered' });
    }
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: 'An error occurred while registering the user.' });
  }
}
exports.logout= async(req,res) =>{
  const UserId = jwt.decode(req.cookies.token).id
  const deleteSession = await Session.destroy({where: { accessToken: req.cookies.token, UserId: UserId }})
  res.clearCookie("token")
  res.redirect('/');
},
exports.login= async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }
    if(user.password){
      const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }
      
      if(req.cookies.token){
        const UserId = jwt.decode(req.cookies.token).id
        const deleteSession = await Session.destroy({where: { accessToken: req.cookies.token, UserId: UserId }})
        res.clearCookie("token")
      }

      const accessToken = createAccessToken(user.id, user.username, user.email)
      const refreshToken = createRefreshToken(user.id, user.username, user.email)
      
      const newSession = await Session.create({
        accessToken: accessToken,
        refreshToken: refreshToken,
        expirationDate: jwt.decode(refreshToken).exp*1000,
        UserId: user.id,
      })

      createCookie(res, accessToken, jwt.decode(refreshToken).exp)
      res.status(200).json({message:"Logged In"})

    }else{
      res.status(401).json({ message: 'Utilizador está registado com outro metodo' });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'An error occurred while logging in.' });
  }
}
exports.authGithub = (req,res) =>{
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email`;
  res.redirect(githubAuthUrl);
}
exports.authGithubCallback = async (req,res) => {
  try {
    // Get the authorization code from the query parameters
    const code = req.query.code;
    // Exchange the authorization code for an access token
    axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    })
    .then(function  (response) {
      const gitAccessToken = response.data.split("=")[1].split("&")[0]
      axios.get("https://api.github.com/user/emails", {headers: { Authorization: `Bearer ${gitAccessToken}` } })
      .then(async function (response) {

        if(req.cookies.token){
          const UserId = jwt.decode(req.cookies.token).id
          const deletSession = await Session.destroy({where: { accessToken: req.cookies.token }})
          res.clearCookie("token")
        }

        const userEmail = response.data[0].email 

        var user = await User.findOne({where:{ email : userEmail}})
        if(!user){    
          // Registar
          axios.get("https://api.github.com/user", {headers: { Authorization: `Bearer ${gitAccessToken}` } })
          .then(async function(response){
            var newUsername = response.data.login

            var newUser = await User.create({
              username: newUsername,
              email : userEmail,
              gitHubToken: gitAccessToken
            })
            

            const accessToken = createAccessToken(newUser.id, newUser.username , newUser.email)
            const refreshToken = createRefreshToken(newUser.id, newUser.username , newUser.email)
            
            const newSession = await Session.create({
              accessToken: accessToken,
              refreshToken: refreshToken,
              expirationDate: jwt.decode(refreshToken).exp*1000,
              UserId: newUser.id,
            })  

            createCookie(res, accessToken, jwt.decode(refreshToken).exp)
            res.status(201).json({message:"Logged In"})

          }).catch(function(err){
            res.status(500).json({ message: err });
          });
        }else{
          //Login
          var existingUser = await User.update({
            gitHubToken:gitAccessToken
          },
          {where:{
            id: user.id
          }})

          const accessToken = createAccessToken(user.id, user.username , user.email)
          const refreshToken = createRefreshToken(user.id, user.username , user.email)
          
          const newSession = await Session.create({
            accessToken: accessToken,
            refreshToken: refreshToken,
            expirationDate: jwt.decode(refreshToken).exp*1000,
            UserId: user.id,
          })

          createCookie(res, accessToken, jwt.decode(refreshToken).exp)
          res.status(200).json({message:"Logged In"})
        }
        
      }).catch(function(err){
        res.status(500).json({ message: err });
      });
    })
    .catch(function (error) {
      res.status(500).json({ message: err });
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}
exports.changePW= async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = req.user
    // Verifica se a senha antiga corresponde
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    // Se não corresponder, retorna uma resposta de erro
    if (!isMatch) {
      return res.status(400).json({ message: 'Senha antiga inválida' });
    }

    // Hash a nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atualiza a senha do usuário
    await User.update(
      { password: hashedPassword },
      { where: { id: user.id } }
    );

    // Retorna uma resposta de sucesso
    return res.status(200).json({ message: 'Senha atualizada com sucesso' });
  }catch(error){
    console.log(error);
    res.status(500).json({ message: 'An error occurred while retrieving the user.' });
  }
}
exports.createPW= async (req, res)=> {
    try {
      const user = req.user  

      const hashedPassword = await bcrypt.hash(createPassword, 10);

      await User.update(
        { password: hashedPassword },
        { where: { id: user.id } }
      );
  
      // Retorna uma resposta de sucesso
      return res.status(200).json({ message: 'Registado com sucesso' });
    }catch(error){
      console.log(error);
      res.status(500).json({ message: 'An error occurred while retrieving the user.' });
    }
  },
exports.changeName= async (req, res) => {
  try {

    const user = req.user;
    const newName = req.body.newName;

    await User.update(
      { username: newName },
      { where: { id: user.id } }
    );

    return res.status(200).json({ message: 'Nome atualizado com sucesso' });
  }catch(error){
    console.log(error);
    res.status(500).json({ message: 'An error occurred while retrieving the user.' });
  }
}
exports.deleteMyAccount= async (req,res) =>{
  const user = req.user
  try{
    const deletedUser = await User.destroy({where:{ id: req.user.id}})
    res.clearCookie("token")
    res.status(200).json({deletedUser})
  }catch(error){
    console.log(error);
    res.status(500).json({ message: 'An error occurred while retrieving the user.' });
  }

}

