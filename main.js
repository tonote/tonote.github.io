const CLIENT_ID = '778261473062-tr2ciii73p0pcgv5af7qre1cuhgmbhnm.apps.googleusercontent.com';
const API_KEY = 'AIzaSyCCshlpHHBSNtrrnUd0BqZs6FmjKJ9YM5k';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');

loadedFile = null;

let notes = new Object();

function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}
const contentContainer = document.getElementsByClassName('main')[0];

function createTextNote(note) {
    const container = document.createElement('div');
    container.classList.add('note-card', 'note-card-text', 'w3-card-2');

    const header = document.createElement('header');
    header.classList.add('margin-left-16');
    const title = document.createElement('h4');
    title.appendChild(document.createTextNode(note.title));
    header.appendChild(title);
    container.appendChild(header);

    const content = document.createElement('div');
    content.classList.add('w3-container');

    if (note.checkings.length === 0) {
        const contentText = document.createElement('p');
        contentText.appendChild(document.createTextNode(note.content));
        content.appendChild(contentText);
    } else if (note.checkings === 'html') {
        const contentText = document.createElement('div');
        contentText.innerHTML = note.content;
        content.appendChild(contentText);
    } else {
        const checkings = note.checkings.split('');
        const labels = note.content.split('\n');
        for (let i = 0; i < checkings.length; i++) {
            const item = document.createElement('div');
            item.classList.add('check-item');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = checkings[i] === '1';
            item.appendChild(input);

            const label = document.createElement('label');
            label.classList.add('margin-left-16');
            label.appendChild(document.createTextNode(labels[i]));
            item.appendChild(label);

            content.appendChild(item);
        }
    }

    container.appendChild(content);

    const footer = document.createElement('footer');
    footer.classList.add('margin-left-16');
    const date = new Date(note.edited);
    const dateString = document.createElement('p');
    dateString.appendChild(document.createTextNode(`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`));

    footer.appendChild(dateString);
    container.appendChild(footer);
    container.style.backgroundColor = toColor(note.color.value);
    contentContainer.appendChild(container);
}

function toColor(num) {
    num >>>= 0;
    const b = num & 0xFF,
        g = (num & 0xFF00) >>> 8,
        r = (num & 0xFF0000) >>> 16,
        a = ( (num & 0xFF000000) >>> 24 ) / 255 ;
    return `rgba(${r},${g},${b},${a})`;
}

function handleAuthClick(event) {
    gapi.auth2.getAuthInstance().signIn();
}

function handleSignOutClick(event) {
    gapi.auth2.getAuthInstance().signOut();
}

function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSignInStatus);

        if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
            listNotes();
        } else {
            showSignInDialog();
        }

    }, function(error) {
        showMessage(JSON.stringify(error, null, 2));
    });
}

function showMessage(message) {
    contentContainer.innerHTML = `<p class="message">` + message + `</p>`;
}

function updateSignInStatus(isSignedIn) {
    if (isSignedIn) {
        gtag('event', 'login', { method : 'Google' });
        listNotes();
    } else {
        gtag('event', 'signout');
        showSignInDialog();
    }
}

function showSignInDialog() {
    contentContainer.innerHTML = "";
    signoutButton.style.display = 'none';

    const loginContainer = document.createElement('div');
    loginContainer.classList.add('login-card', 'w3-card-2', 'w3-white');

    const headerContainer = document.createElement('header');
    const header = document.createElement('h3');
    header.appendChild(document.createTextNode('Sign In'));
    headerContainer.appendChild(header);

    const loginContentContainer = document.createElement('div');
    loginContentContainer.classList.add('w3-container');
    const content = document.createElement('p');
    content.appendChild(document.createTextNode('Use Google Account to see your notes'));
    loginContentContainer.appendChild(content);

    const footerContainer = document.createElement('footer');
    const button = document.createElement('button');
    button.classList.add('google-button');
    button.onclick = handleAuthClick;

    const iconSpan = document.createElement('span');
    iconSpan.classList.add('google-button__icon');

    const googleIcon = document.createElement('object');
    googleIcon.type = 'image/svg+xml';
    googleIcon.data = './assets/google-icon.svg';
    iconSpan.appendChild(googleIcon);
    button.appendChild(iconSpan);

    const buttonTextSpan = document.createElement('span');
    buttonTextSpan.classList.add('google-button__text');
    const buttonText = document.createTextNode('Sign in with Google');
    buttonTextSpan.appendChild(buttonText);
    button.appendChild(buttonTextSpan);
    footerContainer.appendChild(button);

    loginContainer.appendChild(headerContainer);
    loginContainer.appendChild(loginContentContainer);
    loginContainer.appendChild(footerContainer);

    contentContainer.appendChild(loginContainer);
}

function listNotes() {
    contentContainer.innerHTML = "";
    signoutButton.style.display = 'block';
    gtag('event', 'view_item_list');

    gapi.client.drive.files.list({
        'q': "name = 'notes_backup.json' and trashed = false",
        'pageSize': 10,
        'fields': "files(id, name)"
    }).then(function(response) {
        const files = response.result.files;
        if(files.length == 0) {
            showMessage('There are no notes. Maybe you need to make backup from the android application.');
        } else {
            const file = files[0];
            loadFile(file)
        }
    });
}

function loadFile(file) {
    gapi.client.drive.files.get({
        'fileId': file.id,
        'alt': 'media'
    })
        .then(function(response) {
            const loadedFile = JSON.parse(response.body);
            notes = new Object();

            loadedFile.notes.sort(function(a, b) {
                return b.edited - a.edited;
            });

            loadedFile.notes.forEach(function(entry) {
                if (!entry.hasOwnProperty('iv') && entry.state == 0) {
                    notes[entry.id] = entry;
                    createTextNote(entry);
                }
            });

        }, function(error) {
            showMessage('Error during download. Try to reload.');
            console.log("Error during download", error);
        });
}
