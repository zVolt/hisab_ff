var functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.onItemAdded = functions.database.ref('/expenses/{groupId}/{expenseId}')
.onWrite(event =>{
	console.log(event.data.val());
})
