var functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//

var sendFCM = function(expense, groupId){
    const getGroupPromise = admin.database().ref(`/groups/${expense.owner.id}/${groupId}`).once('value')
    const getMemberUsersPromise = admin.database().ref(`/shareWith/${groupId}`).once('value');
    return Promise.all([getGroupPromise, getMemberUsersPromise]).then(result => {
        const groupSnapshot = result[0];
        //return doing nothong is the group doesn't exist
        if (!groupSnapshot.exists()) return;

        var group = groupSnapshot.val();
        group.id = groupSnapshot.key;
        const payload = {
            data: {
                'type': '1', //added
                'desc': expense.description,
                'owner_name': expense.owner.name,
                'owner_id': expense.owner.id,
                'expense_id': expense.id,
                'timestamp': expense.createdOn.toString(),
                'amount': expense.amount.toString(),
                'group_name': group.name,
                'group_id': group.id
            }
        };

        const usersSnapshot = result[1];
        var userTokensPromises = [];
        usersSnapshot.forEach((userSnapshot, index) => {
            const userUid = userSnapshot.key;
            //add the user if he is not the owner of the expense being notified for
            if (userUid !== expense.owner.id)
                userTokensPromises.push(admin.database().ref(`/users/${userUid}/token`).once('value'));
        });
        //add the moderator of the group if he is not the owner of the expense being notified for
        if (group.moderator.id !== expense.owner.id)
            userTokensPromises.push(admin.database().ref(`/users/${group.moderator.id}/token`).once('value'));
        //after all token fetching promises are complete
        return Promise.all(userTokensPromises).then(result => {
            var tokens = [];
            result.forEach((tokenSnapshot, index) => {
				if(tokenSnapshot.exists())
					tokens.push(tokenSnapshot.val());
            });

			if (tokens.length == 0) return console.log('There are no tokens to send notifications to.');

			console.log('There are', tokens.length, 'tokens to send notifications to.');

            return admin.messaging().sendToDevice(tokens, payload).then(response => {
                // For each message check if there was an error.
                // const tokensToRemove = [];
                response.results.forEach((result, index) => {
                    const error = result.error;
                    if (error) {
                        console.error('Failure sending notification to', tokens[index], error);
                        // Cleanup the tokens who are not registered anymore.
                        if (error.code === 'messaging/invalid-registration-token' ||
                            error.code === 'messaging/registration-token-not-registered') {
                            // tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                        }
                    }
                });
                // return Promise.all(tokensToRemove);
            });
        });
    });
};

var getMembersToken = function(groupId){
    return admin.database().ref(`/shareWith/${groupId}`).once('value').then(usersSnapshot => {
        var userTokensPromises = [];
        usersSnapshot.forEach((userSnapshot, index) => {
            const userUid = userSnapshot.key;
            //add the user if he is not the owner of the expense being notified for
            if (userUid !== expense.owner.id)
                userTokensPromises.push(admin.database().ref(`/users/${userUid}/token`).once('value'));
        });
        return Promise.all(userTokensPromises).then(userTokensSnapshot => {
            var tokens = [];
            userTokensSnapshot.forEach((tokenSnapshot, index) => {
                if(tokenSnapshot.exists())
                    tokens.push(tokenSnapshot.val());
            });
            return tokens;
        });
    });
};
exports.onExpenseChanged = functions.database.ref('/expenses/{groupId}/{expenseId}')
    .onWrite(event => {

		var expense = event.data.current.val();
		if (!expense) {
            //deleted expense
            expense = event.data.previous.val();

            return console.log(`item at ${expense.description} deleted`);
        }

		expense.id = event.data.key;
		const groupId = event.params.groupId;
        const expenseId = event.params.expenseId;



        const sendFCMPromise = sendFCM(expense, event.params.groupId);

        const getGroupPromise = admin.database().ref(`/groups/${expense.owner.id}/${groupId}`).once('value')
        const getMemberUsersPromise = admin.database().ref(`/shareWith/${groupId}`).once('value');

        return Promise.all([getGroupPromise, getMemberUsersPromise]).then(result => {
            const groupSnapshot = result[0];
            //return doing nothong is the group doesn't exist
            if (!groupSnapshot.exists()) return;

            const usersSnapshot = result[1];
            var group = groupSnapshot.val();
            group.id = groupSnapshot.key;
            const payload = {
                data: {
                    'type': '1', //added
                    'desc': expense.description,
                    'owner_name': expense.owner.name,
                    'owner_id': expense.owner.id,
                    'expense_id': expense.id,
                    'timestamp': expense.createdOn.toString(),
                    'amount': expense.amount.toString(),
                    'group_name': group.name,
                    'group_id': group.id
                }
            };
			//update lastMsgName and lastMsgDesc content of the group
			//this only updated the group info of the person created the expense, need to update all group nodes
			var lastExpensePromises = {};
			//adding owner of expense
			lastExpensePromises[`/groups/${expense.owner.id}/${groupId}/lastExpense`] = expense;
			//adding owner of group
			lastExpensePromises[`/groups/${group.moderator.id}/${groupId}/lastExpense`] = expense;

            //collect all token fetch promises in this array
            var userTokensPromises = [];
            usersSnapshot.forEach((userSnapshot, index) => {
                const userUid = userSnapshot.key;
                //add the user if he is not the owner of the expense being notified for
                if (userUid !== expense.owner.id)
                    userTokensPromises.push(admin.database().ref(`/users/${userUid}/token`).once('value'));
				//adding members to update lastMsgName and lastMsgDesc of the groups
				lastExpensePromises[`/groups/${userUid}/${groupId}/lastExpense`] = expense;
            });
            //add the moderator of the group if he is not the owner of the expense being notified for
            if (group.moderator.id !== expense.owner.id)
                userTokensPromises.push(admin.database().ref(`/users/${group.moderator.id}/token`).once('value'));

			userTokensPromises.push(admin.database().ref().update(lastExpensePromises));

			//after all token fetching promises are complete
            return Promise.all(userTokensPromises).then(result => {
                result.pop(); //remove returned data from updating lastMsgDesc and lastMsgName properties if all group instance held under lastExpensePromises array
                var tokens = [];
                result.forEach((tokenSnapshot, index) => {
					if(tokenSnapshot.exists())
						tokens.push(tokenSnapshot.val());
                });

				if (tokens.length == 0) return console.log('There are no tokens to send notifications to.');
				console.log('There are', tokens.length, 'tokens to send notifications to.');
                return admin.messaging().sendToDevice(tokens, payload).then(response => {
                    // For each message check if there was an error.
                    // const tokensToRemove = [];
                    response.results.forEach((result, index) => {
                        const error = result.error;
                        if (error) {
                            console.error('Failure sending notification to', tokens[index], error);
                            // Cleanup the tokens who are not registered anymore.
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                                // tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                            }
                        }
                    });
                    // return Promise.all(tokensToRemove);
                });
            });
        });
    });
