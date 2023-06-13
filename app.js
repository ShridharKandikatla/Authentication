require("dotenv").config();
express = require("express");
bodyParser = require("body-parser");
mongoose = require("mongoose");
const ejs = require("ejs");
const bcrypt = require("bcrypt");
const path = require("path");
nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const session = require("cookie-session");
const cookieParser = require("cookie-parser");

let sendOTP = function (email, otp) {
   let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
         user: process.env.userEmail,
         pass: process.env.userPassword,
      },
   });
   let mailOptions = {
      from: "youremail@gmail.com",
      to: email,
      subject: "OTP for password reset",
      text: "Your OTP for password reset is: " + otp,
   };
   transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
         console.log(error);
      } else {
         res.render("error", { type: "Email sent succesfully" });
      }
   });
};

let generateOTP = function () {
   let otp = speakeasy.totp({
      secret: "yoursecret",
      digits: 6,
   });
   return otp;
};

app = express();

app.use(express.static(path.join(__dirname, "views")));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
mongoose.set("strictQuery", false);
mongoose.connect(
   "mongodb+srv://" +
      process.env.MongoDBUsername +
      ":" +
      process.env.MongoDBPassword +
      "@cluster0.n2egjwm.mongodb.net/SocialMediaForEducation?retryWrites=true&w=majority"
);
app.use(cookieParser());
app.use(
   session({
      secret: "yoursecret",
      resave: false,
      saveUninitialized: true,
      cookie: {
         maxAge: 30 * 60 * 1000, // 30 minutes
      },
   })
);

const userSchema = new mongoose.Schema({
   email: String,
   password: String,
   resetOTP: String,
   resetOTPExpires: Date,
});
const User = mongoose.model("User", userSchema);

app.get("/", function (req, res) {
   // render login page
   res.render("index");
});

app.post("/", function (req, res) {
   username = req.body.username;
   password = req.body.password;
   User.findOne({ email: username }, (err, user) => {
      if (err) {
         console.log(err);
      } else if (!user) {
         res.render("error", { type: "No Email Found" });
         res.end();
      } else {
         if (bcrypt.compareSync(password, user.password)) {
            req.session.userId = user._id;
            // req.session.cookie.expires = new Date(Date.now() + 30 * 60 * 1000); // expires in 30 min
            res.render("display", { username: username });
         } else {
            res.render("error", { type: "Invalid Password" });
            res.end();
         }
      }
   });
});

app.get("/display", function (req, res) {
   if (!req.session.userId) {
      res.render("error", { type: "You are not logged in." });
   }
   User.findById(req.session.userId, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error", { type: "User not found." });
      }
      // render profile page
      else {
         res.render("display", { username: username });
      }
   });
});

app.get("/register", function (req, res) {
   res.render("register");
});

app.post("/register", function (req, res) {
   username = req.body.username;
   password = req.body.password;
   User.countDocuments({ email: username }, (err, count) => {
      if (err) {
         console.log(err);
      } else if (count > 0) {
         res.render("error", { type: "Email alraedy exist" });
         res.end();
      } else {
         if (password.length >= 8) {
            const newUser = new User({
               email: username,
               password: bcrypt.hashSync(password, 10),
            });
            newUser.save();
            res.redirect("/");
         } else {
            res.render("error", {
               type: "Password should contain 8 characters",
            });
         }
      }
   });
});

app.get("/forgot-password", (req, res) => {
   res.render("forgot-password");
});

app.post("/forgot-password", function (req, res) {
   // Find the user with the given email address
   User.findOne({ email: req.body.username }, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error", {
            type: "No account with that email address exists.",
         });
      } else {
         // Generate OTP
         let otp = generateOTP();
         // Save the OTP and its expiration date in the user's document
         user.resetOTP = otp;
         user.resetOTPExpires = Date.now() + 3600000; // expires in 1 hour
         user.save(function (err) {
            if (err) {
               console.error(err);
               res.render("error", {
                  type: "An error occurred while processing your request. Please try again later.",
               });
            }
            // Send the OTP to the user's email address or phone number
            sendOTP(user.email, otp);
            res.redirect("/newPassword");
            // return res.status(200).send({ message: 'OTP sent to your email address, please check your email and enter the OTP below to reset your password.' });
         });
      }
   });
});

app.get("/newPassword", function (req, res) {
   res.render("newPassword");
});

app.post("/reset", function (req, res) {
   User.findOne({ email: req.body.username }, function (err, user) {
      if (err) {
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error", {
            type: "No account with that email address exists.",
         });
      }
      if (!user.resetOTP) {
         res.render("error", {
            type: "No OTP found for this account. Please request a new OTP.",
         });
      }
      if (user.resetOTP !== req.body.otp) {
         res.render("error", {
            type: "Invalid OTP. Please enter the correct OTP.",
         });
      }
      if (user.resetOTPExpires < Date.now()) {
         res.render("error", {
            type: "OTP expired. Please request a new OTP.",
         });
      }
      // Update the user's password
      user.password = bcrypt.hashSync(req.body.newPassword, 10);
      user.resetOTP = req.body.otp;
      user.resetOTPExpires = 3600000;
      user.save(function (err) {
         if (err) {
            res.render("error", {
               type: "An error occurred while processing your request. Please try again later.",
            });
         }
         res.render("error", { type: "Password reset successfully." });
      });
   });
});

app.get("/university", function (req, res) {
   if (!req.session.userId) {
      res.render("error", { type: "You are not logged in." });
   }
   User.findById(req.session.userId, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error2", { type: "Login or Create a Account" });
      }
      // render profile page
      else {
         res.render("display", { username: username });
      }
   });
});

app.get("/college", function (req, res) {
   if (!req.session.userId) {
      res.render("error", { type: "You are not logged in." });
   }
   User.findById(req.session.userId, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error2", { type: "Login or Create a Account" });
      }
      // render profile page
      else {
         res.render("display", { username: username });
      }
   });
});

app.get("/city", function (req, res) {
   if (!req.session.userId) {
      res.render("error", { type: "You are not logged in." });
   }
   User.findById(req.session.userId, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error2", { type: "Login or Create a Account" });
      }
      // render profile page
      else {
         res.render("display", { username: username });
      }
   });
});

app.get("/branch", function (req, res) {
   if (!req.session.userId) {
      res.render("error", { type: "You are not logged in." });
   }
   User.findById(req.session.userId, function (err, user) {
      if (err) {
         console.error(err);
         res.render("error", {
            type: "An error occurred while processing your request. Please try again later.",
         });
      }
      if (!user) {
         res.render("error2", { type: "Login or Create a Account" });
      }
      // render profile page
      else {
         res.render("display", { username: username });
      }
   });
});

app.listen(3000, function (err) {
   if (!err) {
      console.log("3000");
   }
});
