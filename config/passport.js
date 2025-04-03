const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userScheme");
const env = require("dotenv").config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://bookverse.website/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            return done(null, user);  // If the user exists, return the user
        } else {
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            await user.save();
            return done(null, user);  // Return the newly created user
        }
    } catch (err) {
        return done(err, null);  // If there is an error, return it
    }
}
));

// Serialize the user (store user ID in session)
passport.serializeUser((user, done) => {
    done(null, user.id);  // Store only user ID in session
});

// Deserialize the user (retrieve user from ID in session)
passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user);  // Retrieve full user object based on ID
        })
        .catch(err => {
            done(err, null);  // Handle errors
        });
});

module.exports = passport;
