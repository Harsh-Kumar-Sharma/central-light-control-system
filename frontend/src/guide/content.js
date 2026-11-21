// In-app user guide: all text lives here, in English and Hindi, so the page component stays small.
// Button / menu names inside the app are in English, so they are kept in English in the Hindi text too
// (a user must be able to find the exact word on screen).
// Facts come from the code of each page; update this file when a page changes.

const t = (en, hi) => ({ en, hi });

export const UI = {
  title: t('User Guide', 'उपयोग गाइड'),
  subtitle: t(
    'How every part of the Highway LED Control system works, and how to set it up — step by step, in plain words.',
    'Highway LED Control सिस्टम का हर हिस्सा कैसे काम करता है और उसे कैसे सेट करना है — आसान भाषा में, स्टेप-बाई-स्टेप।',
  ),
  contents: t('Contents', 'विषय-सूची'),
  search: t('Search the guide…', 'गाइड में खोजें…'),
  noResult: t('Nothing found. Try another word.', 'कुछ नहीं मिला। कोई दूसरा शब्द आज़माएँ।'),
  print: t('Print / Save PDF', 'प्रिंट / PDF सेव करें'),
  openPage: t('Open this page in the app', 'ऐप में यह पेज खोलें'),
  whoCan: t('Who can use it', 'कौन इस्तेमाल कर सकता है'),
  what: t('What is it for?', 'यह किस काम के लिए है?'),
  howTo: t('How to do it, step by step', 'कैसे करें — स्टेप-बाई-स्टेप'),
  buttons: t('What each button / icon does', 'हर बटन / आइकन क्या करता है'),
  config: t('Settings (fields) explained', 'सेटिंग्स (फ़ील्ड) का मतलब'),
  tips: t('Good to know', 'ज़रूरी बातें'),
  shotNote: t('Screenshot from a demo setup', 'डेमो सेटअप का स्क्रीनशॉट'),
  field: t('Field', 'फ़ील्ड'),
  meaning: t('Meaning', 'मतलब'),
  back: t('Back to top', 'ऊपर जाएँ'),
  langLabel: t('Language', 'भाषा'),
  step: t('Step', 'स्टेप'),
};

/* ----- permission names shown to the reader ----- */
export const PERM_NOTE = t(
  'Menu items you cannot see are hidden because your Admin has not given you that permission. Ask your Admin if you need it.',
  'जो मेन्यू आपको नहीं दिखते, उनकी अनुमति (permission) आपके Admin ने नहीं दी है। ज़रूरत हो तो Admin से कहें।',
);

/* ----- Chapters before the module list ----- */
export const INTRO = [
  {
    id: 'overview',
    icon: 'dashboard',
    title: t('1. What is this system?', '1. यह सिस्टम क्या है?'),
    body: [
      t(
        'The Highway LED Control system lets you switch, dim and monitor every highway light from one web page — from the control room, a laptop or a phone. It talks to the lights through small boxes installed in the field.',
        'यह सिस्टम आपको हाईवे की हर लाइट को एक ही वेब पेज से चालू/बंद करने, मंद (dim) करने और उस पर नज़र रखने देता है — कंट्रोल रूम से, लैपटॉप से या फ़ोन से। यह लाइटों से खेत (field) में लगे छोटे बॉक्सों के ज़रिए बात करता है।',
      ),
    ],
    cards: [
      { h: t('Transmitter', 'ट्रांसमीटर (Transmitter)'), p: t('The box that talks to the software (over LAN cable/Wi-Fi, or over an MQTT broker) and sends the radio (LoRa) message to the lights near it. One junction usually has one transmitter.', 'वह बॉक्स जो सॉफ़्टवेयर से बात करता है (LAN केबल/Wi-Fi या MQTT broker से) और अपने पास की लाइटों को रेडियो (LoRa) संदेश भेजता है। आम तौर पर एक जंक्शन पर एक ट्रांसमीटर होता है।') },
      { h: t('Receiver', 'रिसीवर (Receiver)'), p: t('The box on the light pole. It has 2 relays (switches) and can set brightness. In this guide “light” and “receiver” mean the same thing.', 'लाइट के खंभे पर लगा बॉक्स। इसमें 2 रिले (स्विच) होते हैं और यह ब्राइटनेस भी बदल सकता है। इस गाइड में “light” और “receiver” का मतलब एक ही है।') },
      { h: t('Relay 1 / Relay 2', 'Relay 1 / Relay 2'), p: t('The two switches of a receiver (for example left side and right side lamp). Each can be ON or OFF.', 'रिसीवर के दो स्विच (जैसे बायीं और दायीं तरफ़ का लैंप)। हर एक ON या OFF हो सकता है।') },
      { h: t('Network address', 'नेटवर्क एड्रेस (Network address)'), p: t('A number that identifies one receiver. Commands look like Tx_1_R1ON = “receiver 1, relay 1 ON”.', 'एक नंबर जो एक रिसीवर की पहचान है। कमांड ऐसे दिखते हैं: Tx_1_R1ON = “रिसीवर 1, रिले 1 ON”।') },
      { h: t('Brightness', 'ब्राइटनेस (Brightness)'), p: t('A whole number from 1 to 99 (percent).', '1 से 99 के बीच एक पूरा नंबर (प्रतिशत)।') },
      { h: t('Online / Offline / No data', 'Online / Offline / No data'), p: t('Green = the light answered recently. Red = it did not answer. Grey = nothing received yet.', 'हरा = लाइट ने हाल में जवाब दिया। लाल = जवाब नहीं दिया। ग्रे = अभी तक कुछ नहीं मिला।') },
    ],
  },
  {
    id: 'login',
    icon: 'users',
    title: t('2. Signing in and finding your way', '2. लॉगिन करना और ऐप में रास्ता ढूँढना'),
    steps: [
      t('Open the web address given by your Admin. You see the sign-in page.', 'अपने Admin का दिया वेब एड्रेस खोलें। आपको साइन-इन पेज दिखेगा।'),
      t('Type your Username and Password. Click the eye icon inside the password box to see what you typed. A warning appears if Caps Lock is on.', 'अपना Username और Password लिखें। पासवर्ड बॉक्स के अंदर आँख वाले आइकन पर क्लिक करके लिखा हुआ देख सकते हैं। Caps Lock चालू हो तो चेतावनी दिखती है।'),
      t('Click Sign in. You land on the Dashboard (or the first page you are allowed to open).', 'Sign in पर क्लिक करें। आप Dashboard पर पहुँचेंगे (या पहले उस पेज पर जिसकी आपको अनुमति है)।'),
      t('Use the menu on the left to move between pages. On a phone, tap the ☰ button (top-left) to open the menu.', 'पेज बदलने के लिए बायीं तरफ़ का मेन्यू इस्तेमाल करें। फ़ोन पर ऊपर-बायीं ☰ बटन दबाकर मेन्यू खोलें।'),
      t('Top-right: the bell shows new alarms (click it to open Alarms), the sun/moon button switches light and dark theme, and Sign out ends your session.', 'ऊपर-दायीं तरफ़: घंटी (bell) नए अलार्म दिखाती है (क्लिक करने पर Alarms खुलता है), सूरज/चाँद वाला बटन लाइट/डार्क थीम बदलता है, और Sign out से आप लॉग-आउट होते हैं।'),
    ],
    tips: [
      PERM_NOTE,
      t('Your session ends automatically after some hours; just sign in again.', 'कुछ घंटों बाद आपका सेशन अपने-आप खत्म हो जाता है; बस दोबारा साइन-इन करें।'),
      t('The first Admin password is set during installation. Ask your Admin to give you your own user (see Users).', 'पहले Admin का पासवर्ड इंस्टॉलेशन के समय सेट होता है। अपने Admin से अपना अलग यूज़र बनवाएँ (देखें Users)।'),
    ],
  },
  {
    id: 'quickstart',
    icon: 'config',
    title: t('3. First-time setup: the right order', '3. पहली बार सेटअप: सही क्रम'),
    body: [
      t('Do these once, in this order. Each step uses what the earlier step created.', 'ये काम एक बार, इसी क्रम में करें। हर स्टेप पिछले स्टेप में बनी चीज़ें इस्तेमाल करता है।'),
    ],
    steps: [
      t('Devices → add each Transmitter (LAN or MQTT), then press Test (the antenna icon) until it shows Reachable / Connected.', 'Devices → हर Transmitter जोड़ें (LAN या MQTT), फिर Test (एंटीना आइकन) तब तक दबाएँ जब तक Reachable / Connected न दिखे।'),
      t('Devices → add each Receiver under its Transmitter: name, network address, status command, relay names and watts.', 'Devices → हर Receiver को उसके Transmitter के नीचे जोड़ें: नाम, network address, status command, relay के नाम और watts।'),
      t('Devices → press the ⚡ icon on one receiver and switch it ON/OFF to prove the whole chain works.', 'Devices → किसी एक receiver पर ⚡ आइकन दबाएँ और उसे ON/OFF करके जाँचें कि पूरी चेन काम कर रही है।'),
      t('Configuration → check the Polling interval (how often lights are asked for their state).', 'Configuration → Polling interval जाँचें (लाइटों से कितनी बार उनकी स्थिति पूछी जाती है)।'),
      t('Control → + New road → design the road map with its lights (or use a template).', 'Control → + New road → लाइटों के साथ रोड का नक्शा बनाएँ (या template इस्तेमाल करें)।'),
      t('GPS map / Plans (optional) → pin lights on the real map or on a CAD drawing.', 'GPS map / Plans (वैकल्पिक) → लाइटों को असली नक्शे पर या CAD ड्रॉइंग पर लगाएँ।'),
      t('Groups → make sets of lights you often switch together.', 'Groups → उन लाइटों के सेट बनाएँ जिन्हें आप अक्सर साथ में चालू/बंद करते हैं।'),
      t('Schedules → set site location & time zone, then create “ON at sunset / OFF at sunrise”.', 'Schedules → साइट की location और time zone सेट करें, फिर “सूर्यास्त पर ON / सूर्योदय पर OFF” बनाएँ।'),
      t('Reports → set the Electricity price; enter watts on receivers so energy and cost can be estimated.', 'Reports → Electricity price सेट करें; receivers पर watts भरें ताकि ऊर्जा और खर्च का अनुमान लग सके।'),
      t('Users → create a user for each person and tick exactly what they may do.', 'Users → हर व्यक्ति के लिए यूज़र बनाएँ और ठीक वही tick करें जो वे कर सकते हैं।'),
    ],
  },
];

/* ----- Modules ----- */
export const MODULES = [
  /* ---------------------------------------------------------- Dashboard */
  {
    id: 'dashboard', icon: 'dashboard', route: '/', shot: 'dashboard.jpg',
    title: t('Dashboard', 'Dashboard (डैशबोर्ड)'),
    perm: 'dashboard.view',
    tagline: t('One-glance health of all lights, alarms and automation.', 'सभी लाइटों, अलार्म और ऑटोमेशन की एक नज़र में हालत।'),
    what: t(
      'The first page after login. It shows how many lights are online, offline and lit, open alarms, how well commands are succeeding, the health of each road, what is scheduled next, and the latest commands. It refreshes by itself every 15 seconds.',
      'लॉगिन के बाद का पहला पेज। यह बताता है कि कितनी लाइटें online, offline और जल रही हैं, कितने अलार्म खुले हैं, कमांड कितने सफल हो रहे हैं, हर रोड की हालत कैसी है, आगे क्या शेड्यूल है, और ताज़ा कमांड कौन-से हैं। यह हर 15 सेकंड में अपने-आप अपडेट होता है।',
    ),
    buttons: [
      { btn: 'Refresh', does: t('Reloads the numbers right now.', 'आँकड़े अभी तुरंत रीलोड करता है।') },
      { btn: 'Open Control', does: t('Goes to the road map.', 'रोड मैप वाले पेज पर ले जाता है।') },
      { btn: 'All alarms / Schedules / View all logs', does: t('Opens the matching page for details.', 'विस्तार के लिए संबंधित पेज खोलता है।') },
      { btn: t('Click a road row', 'किसी रोड की पंक्ति पर क्लिक'), does: t('Opens that road in Control.', 'उस रोड को Control में खोलता है।') },
    ],
    fields: [
      { name: 'Lights online', meaning: t('Lights that answered recently, out of all lights, with percentage.', 'हाल में जवाब देने वाली लाइटें, कुल लाइटों में से, प्रतिशत के साथ।') },
      { name: 'Lights offline', meaning: t('Lights that stopped answering. “no data” = never reported.', 'जो लाइटें जवाब देना बंद कर चुकी हैं। “no data” = कभी रिपोर्ट नहीं किया।') },
      { name: 'Lit right now', meaning: t('Lights with at least one relay ON.', 'जिन लाइटों का कम से कम एक relay ON है।') },
      { name: 'Open alarms', meaning: t('Problems not yet solved; “new” ones nobody acknowledged.', 'जो समस्याएँ अभी हल नहीं हुईं; “new” = जिन्हें किसी ने acknowledge नहीं किया।') },
      { name: 'Commands OK (24 h)', meaning: t('Percent of commands in the last 24 hours that worked.', 'पिछले 24 घंटे के कमांड में से कितने प्रतिशत सफल रहे।') },
      { name: 'Road health', meaning: t('One bar per road: green online, red offline, grey no data.', 'हर रोड की एक बार: हरा online, लाल offline, ग्रे no data।') },
    ],
    tips: [t('Green “All clear” in Needs attention means no light or transmitter has a problem.', '“Needs attention” में हरा “All clear” का मतलब है कि किसी लाइट या ट्रांसमीटर में समस्या नहीं।')],
  },

  /* ---------------------------------------------------------- Devices */
  {
    id: 'devices', icon: 'devices', route: '/devices', shot: 'devices.jpg', extraShots: [{ file: 'devices-add-receiver.jpg', cap: t('The “Add receiver” window', '“Add receiver” विंडो') }],
    title: t('Devices', 'Devices (डिवाइस)'),
    perm: 'devices.view',
    tagline: t('Register the transmitters and receivers; test the connection.', 'ट्रांसमीटर और रिसीवर दर्ज करना; कनेक्शन टेस्ट करना।'),
    what: t(
      'The “address book” of the system. Every transmitter and every receiver must be added here first; all other pages use this list. Add and edit devices here, test whether a transmitter can be reached, and send a quick test command to one receiver.',
      'सिस्टम की “एड्रेस बुक”। हर transmitter और receiver को पहले यहीं जोड़ना होता है; बाकी सभी पेज इसी सूची का इस्तेमाल करते हैं। यहाँ डिवाइस जोड़ें/बदलें, जाँचें कि transmitter तक पहुँचा जा सकता है, और किसी एक receiver को टेस्ट कमांड भेजें।',
    ),
    tasks: [
      {
        title: t('Add a LAN transmitter', 'LAN transmitter जोड़ना'),
        steps: [
          t('Click + Add transmitter (top of the Transmitters card).', 'Transmitters कार्ड में + Add transmitter पर क्लिक करें।'),
          t('Keep Connection mode = LAN (Ethernet / Wi-Fi).', 'Connection mode = LAN (Ethernet / Wi-Fi) रखें।'),
          t('Fill Name, IP address (e.g. 192.168.1.50) and Port. Gateway, Subnet mask and the others are optional notes.', 'Name, IP address (जैसे 192.168.1.50) और Port भरें। Gateway, Subnet mask आदि वैकल्पिक नोट हैं।'),
          t('Click Save. The new row appears with “Not tested”.', 'Save दबाएँ। नई पंक्ति “Not tested” के साथ दिखेगी।'),
          t('Click the antenna icon (Test connection) → Ping and Check port. A green “Reachable · NN ms” badge means success.', 'एंटीना आइकन (Test connection) दबाएँ → Ping और Check port करें। हरा “Reachable · NN ms” बैज = सफलता।'),
        ],
      },
      {
        title: t('Add an MQTT transmitter', 'MQTT transmitter जोड़ना'),
        steps: [
          t('Click + Add transmitter and choose MQTT (broker).', '+ Add transmitter दबाएँ और MQTT (broker) चुनें।'),
          t('Fill Broker host (IP or name, no “mqtt://”), Broker port (1883 normally), Command topic and Reply topic — exactly the same four settings that are inside the device.', 'Broker host (IP या नाम, “mqtt://” के बिना), Broker port (आम तौर पर 1883), Command topic और Reply topic भरें — ठीक वही चार सेटिंग जो डिवाइस के अंदर हैं।'),
          t('Save, then use Test → Test MQTT connection. The badge in the table should turn green “Connected”.', 'Save करें, फिर Test → Test MQTT connection। टेबल का बैज हरा “Connected” होना चाहिए।'),
        ],
      },
      {
        title: t('Add a receiver (light)', 'Receiver (लाइट) जोड़ना'),
        steps: [
          t('Click + Add receiver in the Receivers card.', 'Receivers कार्ड में + Add receiver दबाएँ।'),
          t('Device name, and choose its Parent transmitter.', 'Device name भरें और उसका Parent transmitter चुनें।'),
          t('Network address = the number used in commands (Tx_<address>_…).', 'Network address = कमांड में इस्तेमाल होने वाला नंबर (Tx_<address>_…)।'),
          t('Optional but useful: Relay names, Relay watts, Status command, Latitude/Longitude.', 'वैकल्पिक पर उपयोगी: Relay के नाम, Relay watts, Status command, Latitude/Longitude।'),
          t('Save. Then click the ⚡ icon on its row and press Relay 1 ON to prove it works.', 'Save करें। फिर उसकी पंक्ति में ⚡ आइकन दबाकर Relay 1 ON से जाँचें कि चल रहा है।'),
        ],
      },
    ],
    buttons: [
      { ic: 'test', label: 'Test connection', does: t('(Transmitter) Opens the test window: Ping, Check port, saved commands, custom text and a log of replies.', '(Transmitter) टेस्ट विंडो खोलता है: Ping, Check port, सेव किए कमांड, कस्टम टेक्स्ट और जवाबों का लॉग।') },
      { ic: 'bolt', label: 'Send commands', does: t('(Receiver) Opens a small control window: Relay 1 ON/OFF, Relay 2 ON/OFF, Brightness (1–99). It shows the exact command text and the reply.', '(Receiver) छोटी कंट्रोल विंडो खोलता है: Relay 1 ON/OFF, Relay 2 ON/OFF, Brightness (1–99)। यह सटीक कमांड टेक्स्ट और जवाब दिखाता है।') },
      { ic: 'edit', label: 'Edit', does: t('Change the details of the row.', 'उस पंक्ति की जानकारी बदलें।') },
      { ic: 'trash', label: 'Delete', does: t('Removes the device after you confirm. Cannot be undone.', 'पुष्टि के बाद डिवाइस हटा देता है। वापस नहीं हो सकता।') },
    ],
    fieldsTitle: t('Transmitter fields', 'Transmitter के फ़ील्ड'),
    fields: [
      { name: 'Name *', meaning: t('Any clear name, e.g. “Junction 1”.', 'कोई साफ़ नाम, जैसे “Junction 1”।') },
      { name: 'IP address / Port', meaning: t('LAN only. Must be a private address (192.168.x.x, 10.x.x.x, 172.16–31.x.x).', 'सिर्फ़ LAN के लिए। निजी (private) एड्रेस ही चलेगा (192.168.x.x, 10.x.x.x, 172.16–31.x.x)।') },
      { name: 'Line ending', meaning: t('What is sent after each command: None (exact text), LF or CRLF. Leave as None unless the device manual says otherwise.', 'हर कमांड के बाद क्या भेजा जाए: None (सटीक टेक्स्ट), LF या CRLF। डिवाइस मैनुअल में अलग न लिखा हो तो None रखें।') },
      { name: 'Broker host / port', meaning: t('MQTT only. Port is 1883 unless changed.', 'सिर्फ़ MQTT के लिए। बदला न हो तो Port 1883।') },
      { name: 'Command topic', meaning: t('Control room → device: commands are published here.', 'कंट्रोल रूम → डिवाइस: कमांड यहाँ भेजे जाते हैं।') },
      { name: 'Reply topic', meaning: t('Device → control room: the software listens here for answers.', 'डिवाइस → कंट्रोल रूम: जवाब के लिए सॉफ़्टवेयर यहाँ सुनता है।') },
      { name: 'Enabled', meaning: t('Only says the record is switched on. It does NOT mean the device is reachable. Use Test for that.', 'सिर्फ़ बताता है कि रिकॉर्ड चालू है। इसका मतलब यह नहीं कि डिवाइस पहुँच में है। उसके लिए Test इस्तेमाल करें।') },
    ],
    fields2Title: t('Receiver fields', 'Receiver के फ़ील्ड'),
    fields2: [
      { name: 'Network address *', meaning: t('Number 0–65535 used in commands. Must match the receiver.', '0–65535 का नंबर जो कमांड में लगता है। receiver से मेल खाना चाहिए।') },
      { name: 'Latitude / Longitude', meaning: t('Optional GPS position. You can also place the light by clicking on the GPS map.', 'वैकल्पिक GPS स्थान। GPS map पर क्लिक करके भी लाइट रख सकते हैं।') },
      { name: 'Relay 1 / 2 name', meaning: t('Friendly names such as “Left side” / “Right side”. They show on the map.', 'आसान नाम जैसे “Left side” / “Right side”। ये नक्शे पर दिखते हैं।') },
      { name: 'Relay 1 / 2 load (watts)', meaning: t('Power of what each relay switches. Reports use it to estimate energy and cost. Empty = this light is left out of energy totals.', 'हर relay जो लोड चलाता है उसकी वाट क्षमता। Reports इससे ऊर्जा और खर्च का अनुमान लगाती हैं। खाली = यह लाइट ऊर्जा के कुल में नहीं गिनी जाएगी।') },
      { name: 'Status command', meaning: t('Text that asks the device for its state, e.g. Tx_{address}_STATUS ({address} is replaced by the network address). The system sends it regularly to show online/offline and relay state. Empty = never asked.', 'वह टेक्स्ट जो डिवाइस से उसकी स्थिति पूछता है, जैसे Tx_{address}_STATUS ({address} की जगह network address लग जाता है)। सिस्टम इसे नियमित भेजकर online/offline और relay की स्थिति दिखाता है। खाली = कभी नहीं पूछा जाएगा।') },
    ],
    tips: [
      t('Run only ONE backend/server against the same devices — two servers talking to one transmitter at the same time make commands fail.', 'एक ही डिवाइस के लिए सिर्फ़ एक सर्वर चलाएँ — दो सर्वर एक साथ एक transmitter से बात करें तो कमांड फ़ेल होते हैं।'),
      t('Deleting a receiver that is drawn on a road leaves a “?” light on that road until you edit the layout.', 'जिस receiver को किसी रोड पर बनाया गया है उसे डिलीट करने पर वहाँ “?” वाली लाइट बची रहती है, जब तक आप layout न सुधारें।'),
      t('Test window: “Send custom text (advanced)” sends exactly what you type. Use it only if you know the device protocol.', 'Test विंडो: “Send custom text (advanced)” वही भेजता है जो आप लिखते हैं। डिवाइस का प्रोटोकॉल पता हो तभी इस्तेमाल करें।'),
    ],
  },

  /* ---------------------------------------------------------- Control */
  {
    id: 'control', icon: 'control', route: '/control', shot: 'control.jpg', extraShots: [{ file: 'control-popup.jpg', cap: t('Click a light: switch its relays and set brightness', 'लाइट पर क्लिक: relay चालू/बंद और ब्राइटनेस') }, { file: 'control-designer.jpg', cap: t('“Edit layout”: the road designer', '“Edit layout”: रोड डिज़ाइनर') }],
    title: t('Control (road map)', 'Control (रोड मैप)'),
    perm: 'control.view · control.control · control.design',
    tagline: t('See every light on a road drawing and switch it.', 'रोड ड्रॉइंग पर हर लाइट देखें और उसे चालू/बंद करें।'),
    what: t(
      'The main working page. A “road” is a drawing of where your lights stand; each light is linked to a receiver. The colour of a light is its live state, and it glows when a relay is ON. Click a light to switch its relays or change brightness. Admins design the roads here too. There are two tabs: Road map and List view.',
      'मुख्य काम का पेज। “रोड” लाइटों की स्थिति का ड्रॉइंग है; हर लाइट एक receiver से जुड़ी होती है। लाइट का रंग उसकी लाइव स्थिति है, और relay ON होने पर वह चमकती है। लाइट पर क्लिक करके relay चालू/बंद या ब्राइटनेस बदलें। Admin यहीं रोड डिज़ाइन भी करते हैं। दो टैब हैं: Road map और List view।',
    ),
    tasks: [
      {
        title: t('Switch one light', 'एक लाइट को चालू/बंद करना'),
        steps: [
          t('Choose the road in the Road drop-down (top-left).', 'ऊपर-बायीं Road ड्रॉप-डाउन से रोड चुनें।'),
          t('Click a light on the map (or its row in the Lights list on the right).', 'नक्शे पर लाइट पर क्लिक करें (या दायीं तरफ़ की Lights सूची में उसकी पंक्ति पर)।'),
          t('In the window press Turn ON / Turn OFF for Relay 1 or Relay 2, or move the brightness slider (1–99) and press Apply.', 'खुली विंडो में Relay 1 या Relay 2 के लिए Turn ON / Turn OFF दबाएँ, या brightness स्लाइडर (1–99) खिसकाकर Apply दबाएँ।'),
          t('Watch the black log box: → sent, ← reply, ✓ ok, ⚠ warning, ✗ error. “ACK received” means the light confirmed.', 'काले लॉग बॉक्स को देखें: → भेजा, ← जवाब, ✓ ठीक, ⚠ चेतावनी, ✗ गलती। “ACK received” = लाइट ने पुष्टि की।'),
        ],
      },
      {
        title: t('Switch every light on the road', 'रोड की सारी लाइटें एक साथ'),
        steps: [
          t('Press All ON (green) or All OFF (red) at the top.', 'ऊपर All ON (हरा) या All OFF (लाल) दबाएँ।'),
          t('Choose Which relay: Both relays, Relay 1 only or Relay 2 only.', 'Which relay चुनें: Both relays, Relay 1 only या Relay 2 only।'),
          t('Press Switch ON / Switch OFF. A progress bar shows “Sending… X of Y”. Lights are done one after another; disabled lights are skipped.', 'Switch ON / Switch OFF दबाएँ। प्रोग्रेस बार “Sending… X of Y” दिखाती है। लाइटें एक-एक करके होती हैं; disabled लाइटें छोड़ दी जाती हैं।'),
          t('Result: green “all accepted” or amber with the names that did not answer.', 'नतीजा: हरा “all accepted” या पीला, उन लाइटों के नाम के साथ जिन्होंने जवाब नहीं दिया।'),
        ],
      },
      {
        title: t('Design a new road (Admin / “Design roads”)', 'नई रोड डिज़ाइन करना (Admin / “Design roads”)'),
        steps: [
          t('Click + New road, type a Road name (must be unique, e.g. “NH-48 Highway”), click Create & design.', '+ New road दबाएँ, Road name लिखें (अनोखा होना चाहिए, जैसे “NH-48 Highway”), Create & design दबाएँ।'),
          t('Fast way: click Start from a template…, pick Straight road or Crossroad, choose Lanes and the number of Lights, click Create layout. It places the lights of receivers not yet on the road.', 'तेज़ तरीका: Start from a template… दबाएँ, Straight road या Crossroad चुनें, Lanes और Lights की संख्या चुनें, Create layout दबाएँ। यह उन receivers की लाइटें लगा देता है जो अभी किसी रोड पर नहीं हैं।'),
          t('Manual way: tool “Draw road” → click points on the map → double-click (or Enter) to finish.', 'हाथ से: “Draw road” टूल → नक्शे पर बिंदु क्लिक करें → खत्म करने के लिए डबल-क्लिक (या Enter)।'),
          t('Tool “Add light” → click a receiver in the list → click the spot on the map. Repeat for each light.', '“Add light” टूल → सूची में receiver पर क्लिक → नक्शे पर जगह पर क्लिक। हर लाइट के लिए दोहराएँ।'),
          t('Tool “Add label” to write text (e.g. “Toll plaza”) on the map.', 'नक्शे पर टेक्स्ट (जैसे “Toll plaza”) लिखने के लिए “Add label” टूल।'),
          t('Click an item with “Select / move” to edit it in the side panel (lanes, linked receiver, name, text size) or drag it.', '“Select / move” से किसी चीज़ पर क्लिक करके साइड पैनल में उसे बदलें (lanes, जुड़ा receiver, नाम, टेक्स्ट का आकार) या खींचकर हिलाएँ।'),
          t('Press Save road (green). Press Cancel to leave without saving (you are asked if there are unsaved changes).', 'Save road (हरा) दबाएँ। बिना सेव किए निकलने के लिए Cancel (बदलाव हों तो पूछा जाएगा)।'),
        ],
      },
    ],
    buttons: [
      { btn: 'Road map / List view', does: t('Two tabs. List view = pick any single light from a list and switch it (no map needed).', 'दो टैब। List view = सूची से कोई भी एक लाइट चुनकर उसे चालू/बंद करें (नक्शे की ज़रूरत नहीं)।') },
      { btn: 'Refresh', does: t('Reads the live state again. The map also refreshes itself every 5 seconds.', 'लाइव स्थिति फिर से पढ़ता है। नक्शा हर 5 सेकंड में खुद भी रिफ़्रेश होता है।') },
      { btn: '+  −  ⤢', does: t('Zoom in, zoom out, fit the whole drawing. Mouse wheel zooms, dragging moves the map.', 'ज़ूम इन, ज़ूम आउट, पूरा ड्रॉइंग स्क्रीन में लाना। माउस व्हील से ज़ूम, खींचने से नक्शा हिलता है।') },
      { btn: 'All / Online / Offline / Lit', does: t('Filters the Lights list on the right.', 'दायीं Lights सूची को फ़िल्टर करता है।') },
      { btn: 'Select / move', does: t('Designer tool: pick and drag roads, lights and labels.', 'डिज़ाइनर टूल: रोड, लाइट और लेबल चुनना और खींचना।') },
      { btn: 'Draw road · Add light · Add label', does: t('Designer tools described above.', 'डिज़ाइनर टूल, ऊपर बताए गए।') },
      { btn: '↶ Undo / ↷ Redo', does: t('Step back / forward (Ctrl+Z / Ctrl+Y), up to 60 steps.', 'एक कदम पीछे / आगे (Ctrl+Z / Ctrl+Y), 60 कदम तक।') },
      { btn: 'Snap to grid', does: t('Makes points land on neat 10-pixel steps (on by default).', 'बिंदुओं को सुव्यवस्थित 10-पिक्सेल की जगह पर बिठाता है (डिफ़ॉल्ट चालू)।') },
      { btn: 'Delete this whole road…', does: t('Removes only the drawing; receivers and transmitters are not touched.', 'सिर्फ़ ड्रॉइंग हटाता है; receivers और transmitters को कुछ नहीं होता।') },
    ],
    fieldsTitle: t('What the colours and symbols mean', 'रंग और चिह्नों का मतलब'),
    fields: [
      { name: t('Green light', 'हरी लाइट'), meaning: t('Online — it answered recently.', 'Online — उसने हाल में जवाब दिया।') },
      { name: t('Red light', 'लाल लाइट'), meaning: t('Offline — it did not answer (two silent checks in a row).', 'Offline — जवाब नहीं दिया (लगातार दो बार चुप)।') },
      { name: t('Grey light', 'ग्रे लाइट'), meaning: t('No data yet.', 'अभी कोई डेटा नहीं।') },
      { name: t('Yellow glow', 'पीली चमक'), meaning: t('Left glow = Relay 1 ON, right glow = Relay 2 ON.', 'बायीं चमक = Relay 1 ON, दायीं चमक = Relay 2 ON।') },
      { name: t('Two small dots under a light', 'लाइट के नीचे दो छोटे बिंदु'), meaning: t('Relay 1 and Relay 2: green = ON.', 'Relay 1 और Relay 2: हरा = ON।') },
      { name: t('Slash through a light', 'लाइट पर तिरछी लकीर'), meaning: t('Disabled — commands are blocked.', 'Disabled — कमांड रुके हुए हैं।') },
      { name: '?', meaning: t('The receiver was deleted. Edit the layout and remove or re-link it.', 'receiver डिलीट हो गया। layout बदलकर उसे हटाएँ या दोबारा जोड़ें।') },
    ],
    tips: [
      t('Brightness works only from 1 to 99.', 'Brightness सिर्फ़ 1 से 99 तक चलता है।'),
      t('If the light shows “No status command is set”, the shown state is only from the last command it confirmed. Set a Status command in Devices.', 'अगर “No status command is set” दिखे, तो दिखने वाली स्थिति सिर्फ़ उसकी आख़िरी पुष्टि वाले कमांड से है। Devices में Status command सेट करें।'),
      t('A receiver can be on a road only once. Max 200 road pieces and 500 lights per road.', 'एक receiver किसी रोड पर सिर्फ़ एक बार हो सकता है। हर रोड पर अधिकतम 200 रोड-पीस और 500 लाइटें।'),
      t('View-only users can see the map but have no ON/OFF buttons.', 'सिर्फ़ देख सकने वाले यूज़र नक्शा देखते हैं पर उनके पास ON/OFF बटन नहीं होते।'),
    ],
  },

  /* ---------------------------------------------------------- GPS map */
  {
    id: 'map', icon: 'map', route: '/map', shot: 'map.jpg',
    title: t('GPS map', 'GPS map (जीपीएस नक्शा)'),
    perm: 'control.view',
    tagline: t('Where every light really stands, on a real map.', 'हर लाइट असल में कहाँ है, असली नक्शे पर।'),
    what: t(
      'An OpenStreetMap showing each light as a pin, coloured by its live state. Click a pin to switch the light. Use it to place lights at their true position and to draw each road’s route line. Refreshes every 5 seconds.',
      'OpenStreetMap पर हर लाइट एक पिन के रूप में, उसकी लाइव स्थिति के रंग में। पिन पर क्लिक करके लाइट चालू/बंद करें। इससे लाइटों को असली जगह पर रखें और हर रोड की रूट-लाइन बनाएँ। हर 5 सेकंड में रिफ़्रेश।',
    ),
    tasks: [
      {
        title: t('Put a light on the map', 'लाइट को नक्शे पर रखना'),
        steps: [
          t('In the right panel open “Not placed”. Click Place next to a light.', 'दायें पैनल में “Not placed” देखें। किसी लाइट के आगे Place दबाएँ।'),
          t('Click the exact spot on the map. The pin appears.', 'नक्शे पर ठीक उस जगह क्लिक करें। पिन आ जाएगा।'),
          t('If slightly off: switch on Move lights and drag the pin. “Position saved.” appears.', 'थोड़ा हटकर हो तो Move lights चालू करें और पिन खींचें। “Position saved.” दिखेगा।'),
          t('To remove a light from the map: with Move lights on, click the red ✕ next to it.', 'लाइट को नक्शे से हटाने के लिए: Move lights चालू करके उसके आगे लाल ✕ दबाएँ।'),
        ],
      },
      {
        title: t('Draw a road’s route', 'रोड की रूट-लाइन बनाना'),
        steps: [
          t('In the “Roads” list press Draw (or Edit) next to the road.', '“Roads” सूची में रोड के आगे Draw (या Edit) दबाएँ।'),
          t('Click along the road on the map. Drag a point to move it, right-click a point to delete it.', 'नक्शे पर रोड के साथ-साथ क्लिक करें। बिंदु खींचकर हिलाएँ, राइट-क्लिक से हटाएँ।'),
          t('Press Save route (needs at least 2 points). Undo, Start over and Cancel are in the same bar.', 'Save route दबाएँ (कम से कम 2 बिंदु चाहिए)। Undo, Start over और Cancel उसी बार में हैं।'),
        ],
      },
    ],
    buttons: [
      { btn: 'Fit to lights', does: t('Zooms the map so all lights are visible.', 'नक्शा इस तरह ज़ूम करता है कि सारी लाइटें दिखें।') },
      { btn: 'Show roads', does: t('Shows or hides the route lines.', 'रूट-लाइन दिखाता/छिपाता है।') },
      { btn: 'Move lights', does: t('Lets you drag pins (needs Devices → Edit permission).', 'पिन खींचने देता है (Devices → Edit की अनुमति चाहिए)।') },
      { btn: 'Place / Cancel', does: t('Start/stop placing a light. Esc also cancels.', 'लाइट रखना शुरू/रोकना। Esc से भी रुकता है।') },
      { btn: 'Draw / Edit / ✕ (roads)', does: t('Draw or change a route; ✕ removes the drawn route (an estimated line is used instead).', 'रूट बनाना या बदलना; ✕ बनाई हुई रूट हटाता है (उसकी जगह अनुमानित लाइन दिखेगी)।') },
    ],
    tips: [
      t('You can also type Latitude/Longitude in Devices → edit receiver.', 'Devices → edit receiver में Latitude/Longitude लिखकर भी जगह दे सकते हैं।'),
      t('GPS positions belong to the receiver; a light appears under a road only if that road’s Control layout includes it.', 'GPS स्थान receiver का होता है; कोई लाइट किसी रोड के नीचे तभी दिखती है जब उस रोड के Control layout में वह शामिल हो।'),
    ],
  },

  /* ---------------------------------------------------------- Plans */
  {
    id: 'plans', icon: 'plans', route: '/plans', shot: 'plans.jpg', extraShots: [{ file: 'plan-detail.jpg', cap: t('A plan page: lights placed on the drawing', 'Plan पेज: ड्रॉइंग पर रखी लाइटें') }],
    title: t('Plans (CAD drawings)', 'Plans (CAD ड्रॉइंग)'),
    perm: 'plans.view · create · edit · delete · place',
    tagline: t('Upload the project drawing and control lights from it.', 'प्रोजेक्ट का ड्रॉइंग अपलोड करें और उसी से लाइटें चलाएँ।'),
    what: t(
      'Upload an engineering drawing (DWG or DXF). The server converts it once; then you see the roads, chainage marks and labels, pin each light to its spot, and switch lights from the drawing, just like on Control.',
      'इंजीनियरिंग ड्रॉइंग (DWG या DXF) अपलोड करें। सर्वर उसे एक बार बदलता है; फिर आपको रोड, चेनेज मार्क और लेबल दिखते हैं, हर लाइट को उसकी जगह पर लगा सकते हैं और Control की तरह ड्रॉइंग से ही लाइट चला सकते हैं।',
    ),
    tasks: [
      {
        title: t('Upload a drawing', 'ड्रॉइंग अपलोड करना'),
        steps: [
          t('Click + Upload drawing, or drag a .dwg / .dxf file onto the page.', '+ Upload drawing दबाएँ, या .dwg / .dxf फ़ाइल पेज पर खींचकर छोड़ें।'),
          t('Check the Plan name (max 150 letters) and click Upload. Wait while “Converting the drawing…” runs (a few seconds for big files).', 'Plan name (अधिकतम 150 अक्षर) जाँचें और Upload दबाएँ। “Converting the drawing…” चलते समय इंतज़ार करें (बड़ी फ़ाइल में कुछ सेकंड)।'),
          t('You are taken to the plan page automatically.', 'आप अपने-आप plan पेज पर पहुँच जाएँगे।'),
        ],
      },
      {
        title: t('Place the lights on the drawing', 'ड्रॉइंग पर लाइटें रखना'),
        steps: [
          t('On the plan page open the Lights tab. Under “Not placed” click Place next to a light.', 'Plan पेज पर Lights टैब खोलें। “Not placed” में किसी लाइट के आगे Place दबाएँ।'),
          t('Click the spot on the drawing. To adjust later tick Move lights and drag.', 'ड्रॉइंग पर जगह क्लिक करें। बाद में सुधारने के लिए Move lights tick करें और खींचें।'),
          t('Click a placed light to open its control window.', 'रखी हुई लाइट पर क्लिक करके उसकी कंट्रोल विंडो खोलें।'),
        ],
      },
      {
        title: t('Choose which layers show', 'कौन-सी लेयर दिखे, यह चुनना'),
        steps: [
          t('Open the Layers tab. Tick or untick layers; Show all / Hide all and the search box help.', 'Layers टैब खोलें। लेयर tick/untick करें; Show all / Hide all और सर्च बॉक्स मदद करते हैं।'),
          t('If you have edit permission press Save for everyone so others see the same view. Reset goes back to the file’s own settings.', 'एडिट की अनुमति हो तो Save for everyone दबाएँ ताकि सबको वही व्यू दिखे। Reset फ़ाइल की अपनी सेटिंग पर लौटाता है।'),
        ],
      },
    ],
    buttons: [
      { btn: 'Open', does: t('Opens the plan page.', 'Plan पेज खोलता है।') },
      { btn: 'Pin as mini map', does: t('Shows a small floating copy of this plan at the bottom-right of every page (one plan at a time; hidden on small screens). Its buttons: S / M / L size, ▾ fold, ↗ open full page, ✕ close.', 'हर पेज के नीचे-दायें इस plan की छोटी तैरती कॉपी दिखाता है (एक बार में एक plan; छोटी स्क्रीन पर छिपी)। इसके बटन: S / M / L आकार, ▾ समेटना, ↗ पूरा पेज, ✕ बंद।') },
      { btn: 'Delete', does: t('Removes the drawing and the light positions on it. The lights themselves are not touched.', 'ड्रॉइंग और उस पर लाइटों की जगहें हटाता है। लाइटों को कुछ नहीं होता।') },
      { btn: '+ / −', does: t('Zoom in / out.', 'ज़ूम इन / आउट।') },
      { btn: '⤢', does: t('Fit everything to the screen (key 0).', 'सब कुछ स्क्रीन में फ़िट (कुंजी 0)।') },
      { btn: 'Rotate icon', does: t('Turns the drawing a quarter turn (key R).', 'ड्रॉइंग को चौथाई घुमाता है (कुंजी R)।') },
      { btn: 'Mouse icon', does: t('Switches the mouse wheel between “scroll” and “zoom”.', 'माउस व्हील को “स्क्रॉल” और “ज़ूम” के बीच बदलता है।') },
      { btn: 'Full screen', does: t('Fills the screen; Esc leaves.', 'पूरी स्क्रीन; Esc से बाहर।') },
      { btn: t('Pencil beside the name', 'नाम के पास पेंसिल'), does: t('Rename the plan.', 'Plan का नाम बदलें।') },
    ],
    tips: [
      t('Limits: file up to 40 MB; only one drawing is converted at a time (“Another drawing is being converted right now” – try again).', 'सीमाएँ: फ़ाइल 40 MB तक; एक समय में एक ही ड्रॉइंग बदली जाती है (“Another drawing is being converted right now” आए तो फिर कोशिश करें)।'),
      t('If a DWG cannot be read, save it from CAD as an older DWG version or as DXF and upload again.', 'DWG न पढ़ी जाए तो CAD से उसे पुराने DWG वर्ज़न या DXF में सेव करके फिर अपलोड करें।'),
      t('Not drawn: images, dimensions, solids, 3D, paper space. Hatches are drawn as outlines.', 'नहीं बनते: इमेज, dimensions, solids, 3D, paper space। Hatch सिर्फ़ बाहरी रेखा के रूप में बनता है।'),
      t('Keyboard (click the drawing first): + / − zoom, arrow keys move, 0 fit, R rotate. Two-finger pinch zooms on touch screens.', 'कीबोर्ड (पहले ड्रॉइंग पर क्लिक करें): + / − ज़ूम, तीर वाली कुंजियाँ हिलाने के लिए, 0 फ़िट, R घुमाना। टच स्क्रीन पर दो उँगलियों से ज़ूम।'),
    ],
  },

  /* ---------------------------------------------------------- Tunnels */
  {
    id: 'tunnels', icon: 'tunnels', route: '/tunnels', shot: 'tunnels.jpg', extraShots: [{ file: 'tunnels-edit.jpg', cap: t('The zone editor', 'ज़ोन एडिटर') }],
    title: t('Tunnels', 'Tunnels (सुरंग)'),
    perm: 'tunnels.view · create · edit · delete · control',
    tagline: t('Zones with Day / Evening / Night brightness for a tunnel.', 'सुरंग के लिए ज़ोन और Day / Evening / Night ब्राइटनेस।'),
    what: t(
      'A tunnel needs more light at the entrance (eyes must adjust) and less inside. Here you split a tunnel into zones from Entrance to Exit, choose the lights in each zone, set a brightness for Day, Evening and Night, and then switch the whole tunnel with one click.',
      'सुरंग के प्रवेश पर ज़्यादा रोशनी चाहिए (आँखों को आदत पड़ने के लिए) और अंदर कम। यहाँ आप सुरंग को Entrance से Exit तक ज़ोन में बाँटते हैं, हर ज़ोन की लाइटें चुनते हैं, Day, Evening और Night की ब्राइटनेस तय करते हैं, और फिर एक क्लिक से पूरी सुरंग बदल देते हैं।',
    ),
    tasks: [
      {
        title: t('Create a tunnel with zones', 'ज़ोन के साथ सुरंग बनाना'),
        steps: [
          t('Click + New tunnel. Enter Name (unique), optionally Length (metres) and Notes, then Create.', '+ New tunnel दबाएँ। Name (अनोखा), चाहें तो Length (metres) और Notes भरें, फिर Create।'),
          t('The zone editor opens. Press Start with 4 typical zones (Entrance, Transition, Interior, Exit) or + Add zone (up to 20).', 'ज़ोन एडिटर खुलेगा। Start with 4 typical zones (Entrance, Transition, Interior, Exit) या + Add zone दबाएँ (20 तक)।'),
          t('For each zone: name, type, and the Day / Evening / Night sliders (1–99 %). Use the ↑ ↓ arrows to order from entrance to exit.', 'हर ज़ोन के लिए: नाम, type और Day / Evening / Night स्लाइडर (1–99 %)। Entrance से Exit के क्रम के लिए ↑ ↓ तीर इस्तेमाल करें।'),
          t('Open “N lights in this zone” and tick the lights. A light can be in only one zone.', '“N lights in this zone” खोलकर लाइटें tick करें। एक लाइट सिर्फ़ एक ज़ोन में हो सकती है।'),
          t('Click Save tunnel. Saving does NOT change the lights yet.', 'Save tunnel दबाएँ। सेव करने से लाइटें अभी नहीं बदलतीं।'),
        ],
      },
      {
        title: t('Switch the tunnel mode', 'सुरंग का मोड बदलना'),
        steps: [
          t('Click Day, Evening, Night or Off on the tunnel card.', 'सुरंग कार्ड पर Day, Evening, Night या Off दबाएँ।'),
          t('Read the preview of each zone’s level and click Switch to <Mode>.', 'हर ज़ोन के स्तर का प्रीव्यू पढ़कर Switch to <Mode> दबाएँ।'),
          t('It runs in the background with a progress bar; you can leave the page. When done a banner shows how many lights replied.', 'यह बैकग्राउंड में प्रोग्रेस बार के साथ चलता है; आप पेज छोड़ सकते हैं। खत्म होने पर बैनर बताता है कितनी लाइटों ने जवाब दिया।'),
        ],
      },
    ],
    buttons: [
      { btn: 'Day · Evening · Night · Off', does: t('Day = brightest at the entrance; Evening = dusk/dawn; Night = lowest levels; Off = everything off.', 'Day = प्रवेश पर सबसे तेज़; Evening = शाम/भोर; Night = सबसे कम स्तर; Off = सब बंद।') },
      { btn: 'Edit zones', does: t('Opens the zone editor.', 'ज़ोन एडिटर खोलता है।') },
      { btn: 'Delete', does: t('Deletes the tunnel and its zones (lights untouched). Blocked if a schedule uses it.', 'सुरंग और उसके ज़ोन हटाता है (लाइटें वैसी ही)। किसी schedule में इस्तेमाल हो तो रुकता है।') },
    ],
    fieldsTitle: t('Typical zone levels (Day / Evening / Night)', 'ज़ोन के सामान्य स्तर (Day / Evening / Night)'),
    fields: [
      { name: 'Entrance (threshold)', meaning: t('99 / 70 / 50', '99 / 70 / 50') },
      { name: 'Transition', meaning: t('80 / 60 / 40', '80 / 60 / 40') },
      { name: 'Interior', meaning: t('60 / 45 / 30', '60 / 45 / 30') },
      { name: 'Exit', meaning: t('70 / 50 / 35', '70 / 50 / 35') },
    ],
    tips: [
      t('These are only a starting point. Set the levels your tunnel design requires.', 'ये सिर्फ़ शुरुआती मान हैं। अपनी सुरंग के डिज़ाइन के अनुसार स्तर रखें।'),
      t('Day/Evening/Night set both relays ON and the zone brightness; Off switches both relays OFF.', 'Day/Evening/Night दोनों relay ON करके ज़ोन की ब्राइटनेस लगाते हैं; Off दोनों relay बंद करता है।'),
      t('A tunnel can be switched automatically by a Schedule (target “A tunnel”).', 'Schedule (target “A tunnel”) से सुरंग अपने-आप भी बदली जा सकती है।'),
      t('If some lights do not reply a warning alarm is raised; it clears after the next clean change.', 'कुछ लाइटें जवाब न दें तो चेतावनी अलार्म बनता है; अगला साफ़ बदलाव होने पर वह हट जाता है।'),
    ],
  },

  /* ---------------------------------------------------------- Sensors */
  {
    id: 'sensors', icon: 'sensors', route: '/sensors', shot: 'sensors.jpg',
    title: t('Sensors', 'Sensors (सेंसर)'),
    perm: 'sensors.view · sensors.configure',
    tagline: t('Readings from the lights, and alarm rules on them.', 'लाइटों से आने वाली रीडिंग और उन पर अलार्म नियम।'),
    what: t(
      'Shows the readings each light sends back — ambient light, power, voltage, current, temperature, energy, motion — and lets you create rules that raise an alarm when something looks wrong (for example a lamp that is ON but draws no power).',
      'हर लाइट जो रीडिंग भेजती है — आसपास की रोशनी, बिजली (power), वोल्टेज, करंट, तापमान, ऊर्जा, मोशन — वह दिखाता है, और ऐसे नियम बनाने देता है जो कुछ गड़बड़ दिखने पर अलार्म उठाएँ (जैसे लैंप ON है पर बिजली नहीं खींच रहा)।',
    ),
    tasks: [
      {
        title: t('See a reading’s history', 'किसी रीडिंग का इतिहास देखना'),
        steps: [
          t('Click a tile (for example Temperature) on a light’s card.', 'किसी लाइट के कार्ड पर टाइल (जैसे Temperature) पर क्लिक करें।'),
          t('Choose the Reading and the period: 1 h, 6 h, 24 h or 7 d. A line chart appears.', 'Reading और अवधि चुनें: 1 h, 6 h, 24 h या 7 d। एक लाइन चार्ट दिखेगा।'),
        ],
      },
      {
        title: t('Create an alarm rule', 'अलार्म नियम बनाना'),
        steps: [
          t('Click + New rule and type a Name (e.g. “Driver too hot”).', '+ New rule दबाएँ और Name लिखें (जैसे “Driver too hot”)।'),
          t('What to watch: “A reading” → pick the reading, “above” or “below” and a Value (e.g. Temperature above 70). Or “Dead lamp” → minimum watts while ON.', 'क्या देखना है: “A reading” → रीडिंग, “above” या “below” और Value चुनें (जैसे Temperature above 70)। या “Dead lamp” → ON होने पर न्यूनतम watts।'),
          t('Applies to: All lights or one light. Severity: Warning or Critical.', 'Applies to: All lights या एक लाइट। Severity: Warning या Critical।'),
          t('Click Save rule. The alarm appears on the Alarms page while the condition holds and clears by itself afterwards.', 'Save rule दबाएँ। शर्त के बने रहने तक अलार्म Alarms पेज पर दिखेगा और बाद में अपने-आप हट जाएगा।'),
        ],
      },
    ],
    buttons: [
      { btn: t('Toggle switch on a rule', 'नियम पर टॉगल'), does: t('Switch the rule on/off without deleting it.', 'नियम को डिलीट किए बिना चालू/बंद करें।') },
      { btn: 'Edit / Delete', does: t('Change or remove a rule. Its open alarms are cleared.', 'नियम बदलें या हटाएँ। उसके खुले अलार्म साफ़ हो जाते हैं।') },
    ],
    fieldsTitle: t('Tiles on a light’s card', 'लाइट के कार्ड की टाइलें'),
    fields: [
      { name: 'Ambient light', meaning: t('Lux. Guide: night <10, dim <1000, daylight <10000, bright sun above.', 'Lux। संकेत: रात <10, धुँधला <1000, दिन <10000, तेज़ धूप उससे ऊपर।') },
      { name: 'Power / Voltage / Current', meaning: t('W / V / A.', 'W / V / A।') },
      { name: 'Temperature / Energy / Motion', meaning: t('°C / kWh / Detected or None.', '°C / kWh / Detected या None।') },
    ],
    tips: [
      t('Readings appear only if the light’s reply to the status command includes them (e.g. {"relay1":true,"brightness":50,"ambient":320,"voltage":231,"power":148}) and a Status command is set in Devices.', 'रीडिंग तभी दिखती है जब status command के जवाब में वे शामिल हों (जैसे {"relay1":true,"brightness":50,"ambient":320,"voltage":231,"power":148}) और Devices में Status command सेट हो।'),
      t('History is saved about once a minute and kept for 30 days. A card dims with “No new reading for over 5 minutes”.', 'इतिहास लगभग हर मिनट सेव होता है और 30 दिन रखा जाता है। 5 मिनट से ज़्यादा नई रीडिंग न आए तो कार्ड फीका दिखता है।'),
    ],
  },

  /* ---------------------------------------------------------- Groups */
  {
    id: 'groups', icon: 'groups', route: '/groups', shot: 'groups.jpg',
    title: t('Groups', 'Groups (समूह)'),
    perm: 'groups.view · create · control',
    tagline: t('Name a set of lights and switch them together.', 'लाइटों के सेट को नाम दें और साथ में चलाएँ।'),
    what: t(
      'A group is a named list of lights, for example “Toll plaza lights”, even if they are on different roads. Switch or dim all members with one click.',
      'ग्रुप लाइटों की नामित सूची है, जैसे “Toll plaza lights”, चाहे वे अलग-अलग रोड पर हों। एक क्लिक से सभी सदस्यों को चालू/बंद या मंद करें।',
    ),
    tasks: [
      {
        title: t('Create a group', 'ग्रुप बनाना'),
        steps: [
          t('In the form below the table type a Group name (unique).', 'टेबल के नीचे फ़ॉर्म में Group name लिखें (अनोखा)।'),
          t('Tick the lights in Devices (Select all / Clear help; the counter shows “N of M selected”).', 'Devices में लाइटें tick करें (Select all / Clear मदद करते हैं; काउंटर “N of M selected” दिखाता है)।'),
          t('Click + Create group.', '+ Create group दबाएँ।'),
        ],
      },
      {
        title: t('Switch a group', 'ग्रुप को चलाना'),
        steps: [
          t('In “Group control” choose the Group and the Relays (Both / Relay 1 only / Relay 2 only).', '“Group control” में Group और Relays चुनें (Both / Relay 1 only / Relay 2 only)।'),
          t('Press All ON or All OFF, or enter a Brightness (1–99) and press Apply to group.', 'All ON या All OFF दबाएँ, या Brightness (1–99) लिखकर Apply to group दबाएँ।'),
          t('The Group result card shows SUCCESS, PARTIAL_SUCCESS or FAILED and a line for every light.', 'Group result कार्ड SUCCESS, PARTIAL_SUCCESS या FAILED और हर लाइट की एक पंक्ति दिखाता है।'),
        ],
      },
    ],
    buttons: [
      { btn: 'Edit / Delete', does: t('Edit loads the group into the form. Delete removes only the group; the lights stay as they are.', 'Edit ग्रुप को फ़ॉर्म में लाता है। Delete सिर्फ़ ग्रुप हटाता है; लाइटें वैसी ही रहती हैं।') },
    ],
    tips: [
      t('Commands go to the lights one at a time, so a big group takes a little while.', 'कमांड लाइटों को एक-एक करके जाते हैं, इसलिए बड़े ग्रुप में थोड़ा समय लगता है।'),
      t('With both relays, a light counts as successful only if both commands were confirmed.', 'दोनों relay में, लाइट तभी सफल गिनी जाती है जब दोनों कमांड की पुष्टि हो।'),
    ],
  },

  /* ---------------------------------------------------------- Reports */
  {
    id: 'reports', icon: 'reports', route: '/reports', shot: 'reports.jpg',
    title: t('Reports', 'Reports (रिपोर्ट)'),
    perm: 'reports.view · export · configure',
    tagline: t('Uptime, hours lit, energy, cost, commands and alarms.', 'अपटाइम, जलने के घंटे, ऊर्जा, खर्च, कमांड और अलार्म।'),
    what: t(
      'Pick a period (and optionally one road) and see how well the lights performed, an estimate of electricity used and its cost, how much was saved by dimming, how many commands were sent and what alarms occurred. Download CSV files for Excel, or print the page as a PDF.',
      'अवधि चुनें (और चाहें तो एक रोड) और देखें कि लाइटों का प्रदर्शन कैसा रहा, बिजली का अनुमानित उपयोग और खर्च, डिमिंग से कितनी बचत हुई, कितने कमांड भेजे गए और कौन-से अलार्म आए। Excel के लिए CSV फ़ाइल डाउनलोड करें या पेज को PDF के रूप में प्रिंट करें।',
    ),
    tasks: [
      {
        title: t('Set the electricity price (once)', 'बिजली की कीमत सेट करना (एक बार)'),
        steps: [
          t('Click Electricity price (top-right). Type Price per kWh (e.g. 8.50) and a Currency code (INR).', 'Electricity price (ऊपर-दायें) दबाएँ। Price per kWh (जैसे 8.50) और Currency code (INR) लिखें।'),
          t('Click Save. Cost and savings now appear. Leave the price empty to hide cost.', 'Save दबाएँ। अब खर्च और बचत दिखेंगे। कीमत खाली छोड़ने पर खर्च छिपा रहेगा।'),
        ],
      },
      {
        title: t('Make a report', 'रिपोर्ट बनाना'),
        steps: [
          t('Choose Today, Last 7 days, Last 30 days or Custom (From / To, up to 92 days). Optionally choose a road.', 'Today, Last 7 days, Last 30 days या Custom (From / To, 92 दिन तक) चुनें। चाहें तो रोड चुनें।'),
          t('The numbers reload by themselves. Read the five tiles, the Energy per day chart and the Lights table.', 'आँकड़े खुद रीलोड होते हैं। पाँच टाइलें, Energy per day चार्ट और Lights टेबल पढ़ें।'),
          t('Click Download CSV in a card for Excel, or Print / Save as PDF at the top.', 'Excel के लिए किसी कार्ड में Download CSV दबाएँ, या ऊपर Print / Save as PDF।'),
        ],
      },
    ],
    fieldsTitle: t('Numbers explained', 'आँकड़ों का मतलब'),
    fields: [
      { name: 'Average uptime', meaning: t('Share of known time the lights were online. Green ≥ 99 %, amber 90–99 %, red < 90 %.', 'जाने हुए समय में लाइटें कितना online रहीं। हरा ≥ 99 %, पीला 90–99 %, लाल < 90 %।') },
      { name: 'Hours lit', meaning: t('Time with at least one relay ON.', 'कम से कम एक relay ON रहने का समय।') },
      { name: 'Estimated energy', meaning: t('Rated watts of relays that were ON × time × brightness. It is an estimate, not a meter reading.', 'ON रहे relay के rated watts × समय × ब्राइटनेस। यह अनुमान है, मीटर की रीडिंग नहीं।') },
      { name: 'Estimated cost', meaning: t('Energy × Price per kWh.', 'ऊर्जा × Price per kWh।') },
      { name: 'Saved by dimming', meaning: t('Energy at full brightness minus estimated energy.', 'पूरी ब्राइटनेस की ऊर्जा घटा अनुमानित ऊर्जा।') },
    ],
    tips: [
      t('Enter watts for each relay in Devices → edit receiver. Lights without watts show “no wattage” and are left out of energy and cost.', 'Devices → edit receiver में हर relay के watts भरें। बिना watts वाली लाइटें “no wattage” दिखाती हैं और ऊर्जा/खर्च से बाहर रहती हैं।'),
      t('History starts from the day the feature was switched on; earlier days stay empty.', 'इतिहास उस दिन से शुरू होता है जब यह सुविधा चालू हुई; उससे पहले के दिन खाली रहते हैं।'),
      t('The CSV for commands holds the latest 20,000 rows.', 'कमांड वाली CSV में ताज़ा 20,000 पंक्तियाँ होती हैं।'),
    ],
  },

  /* ---------------------------------------------------------- Alarms */
  {
    id: 'alarms', icon: 'alarms', route: '/alarms', shot: 'alarms.jpg',
    title: t('Alarms', 'Alarms (अलार्म)'),
    perm: 'alarms.view · alarms.acknowledge',
    tagline: t('Problems that need attention. They clear when the problem is gone.', 'ध्यान देने लायक समस्याएँ। समस्या जाने पर ये अपने-आप हट जाते हैं।'),
    what: t(
      'The list of current problems. The bell at the top-right and the red number in the menu show how many are new. Open tab = still a problem. History tab = solved ones. Refreshes every 10 seconds.',
      'मौजूदा समस्याओं की सूची। ऊपर-दायीं घंटी और मेन्यू का लाल नंबर बताता है कितने नए हैं। Open टैब = अभी भी समस्या है। History टैब = सुलझ चुके। हर 10 सेकंड में रिफ़्रेश।',
    ),
    tasks: [
      {
        title: t('Handle an alarm', 'अलार्म संभालना'),
        steps: [
          t('Open the Open tab. Critical ones (red) come first.', 'Open टैब खोलें। Critical (लाल) पहले आते हैं।'),
          t('Read the title and detail, then click the link on the card (Open devices / schedules / tunnels / sensors) to fix the cause.', 'टाइटल और विवरण पढ़ें, फिर कार्ड पर लिंक (Open devices / schedules / tunnels / sensors) से कारण ठीक करें।'),
          t('Click Acknowledge to tell the team “I have seen it” (or Acknowledge all). It does not fix anything; the alarm goes to History only when the problem itself goes away.', 'टीम को “मैंने देख लिया” बताने के लिए Acknowledge (या Acknowledge all) दबाएँ। इससे कुछ ठीक नहीं होता; अलार्म तभी History में जाता है जब समस्या खुद खत्म हो।'),
        ],
      },
    ],
    fieldsTitle: t('Kinds of alarms', 'अलार्म के प्रकार'),
    fields: [
      { name: t('“<light> is offline” — critical', '“<light> is offline” — critical'), meaning: t('A light did not answer twice in a row (or was silent longer than the offline threshold). Clears when it reports again.', 'लाइट लगातार दो बार जवाब नहीं दे पाई (या offline threshold से ज़्यादा चुप रही)। दोबारा रिपोर्ट करने पर हट जाता है।') },
      { name: t('“Transmitter … is unreachable” — critical', '“Transmitter … is unreachable” — critical'), meaning: t('Every light behind it cannot be controlled or read.', 'उसके पीछे की हर लाइट न चलाई जा सकती है न पढ़ी जा सकती है।') },
      { name: t('Schedule … did not reach every light — warning', 'Schedule … did not reach every light — warning'), meaning: t('Some lights gave no reply when a schedule ran. Clears after a fully successful run.', 'schedule चलने पर कुछ लाइटों ने जवाब नहीं दिया। पूरी तरह सफल रन के बाद हट जाता है।') },
      { name: t('Tunnel … did not reach every light — warning', 'Tunnel … did not reach every light — warning'), meaning: t('Same, for a tunnel mode change.', 'यही, सुरंग का मोड बदलने पर।') },
      { name: t('Sensor rule alarms', 'Sensor नियम के अलार्म'), meaning: t('Raised by your own rules (Warning or Critical); clear when the reading is normal again.', 'आपके अपने नियमों से बनते हैं (Warning या Critical); रीडिंग सामान्य होने पर हट जाते हैं।') },
    ],
    tips: [t('Only one open alarm is kept per problem, so you will not see duplicates.', 'हर समस्या का एक ही खुला अलार्म रखा जाता है, इसलिए दोहराव नहीं दिखेगा।')],
  },

  /* ---------------------------------------------------------- Schedules */
  {
    id: 'schedules', icon: 'schedules', route: '/schedules', shot: 'schedules.jpg', extraShots: [{ file: 'schedules-new.jpg', cap: t('The “New schedule” window', '“New schedule” विंडो') }],
    title: t('Schedules', 'Schedules (शेड्यूल)'),
    perm: 'schedules.view · create · edit · delete · run',
    tagline: t('Switch lights automatically at a time, sunrise or sunset.', 'तय समय, सूर्योदय या सूर्यास्त पर लाइटें अपने-आप चलाएँ।'),
    what: t(
      'A schedule says: “at this time, on these days, do this to this road / group / light / tunnel”. The server checks every 30 seconds and runs it for you, even when nobody is logged in.',
      'शेड्यूल कहता है: “इस समय, इन दिनों, इस रोड / ग्रुप / लाइट / सुरंग के साथ यह करो”। सर्वर हर 30 सेकंड में जाँचता है और खुद चला देता है, चाहे कोई लॉगिन हो या नहीं।',
    ),
    tasks: [
      {
        title: t('Set the site location (once)', 'साइट की location सेट करना (एक बार)'),
        steps: [
          t('Click Location & time zone (or Set location in the amber box).', 'Location & time zone (या पीले बॉक्स में Set location) दबाएँ।'),
          t('Type Latitude and Longitude, or press “Use this computer’s location”. Choose the Time zone (default Asia/Kolkata).', 'Latitude और Longitude लिखें, या “Use this computer’s location” दबाएँ। Time zone चुनें (डिफ़ॉल्ट Asia/Kolkata)।'),
          t('Save. The green box now shows today’s Sunrise and Sunset times.', 'Save करें। हरे बॉक्स में आज के Sunrise और Sunset का समय दिखेगा।'),
        ],
      },
      {
        title: t('Create “ON at sunset” for a road', '“सूर्यास्त पर ON” शेड्यूल बनाना'),
        steps: [
          t('Click + New schedule. Name: “Highway ON at sunset”.', '+ New schedule दबाएँ। Name: “Highway ON at sunset”।'),
          t('What to switch: A whole road → Which one: pick the road.', 'What to switch: A whole road → Which one: रोड चुनें।'),
          t('Action: Turn ON, Relay: Both relays.', 'Action: Turn ON, Relay: Both relays।'),
          t('When: ☾ Sunset, Minutes 0 (or e.g. 15 “before sunset”).', 'When: ☾ Sunset, Minutes 0 (या जैसे 15 “before sunset”)।'),
          t('Days: leave all seven selected. Save schedule.', 'Days: सातों चुने रहने दें। Save schedule।'),
          t('Create a second one: Turn OFF at ☀ Sunrise.', 'दूसरा बनाएँ: ☀ Sunrise पर Turn OFF।'),
        ],
      },
      {
        title: t('Test it immediately', 'तुरंत जाँचना'),
        steps: [
          t('Press Run now on the schedule card. A banner says how many lights confirmed.', 'शेड्यूल कार्ड पर Run now दबाएँ। बैनर बताएगा कितनी लाइटों ने पुष्टि की।'),
          t('See “Recent runs” at the bottom of the page.', 'पेज के नीचे “Recent runs” देखें।'),
        ],
      },
    ],
    buttons: [
      { btn: t('Toggle switch', 'टॉगल स्विच'), does: t('Pause / resume the schedule.', 'शेड्यूल रोकना / फिर चालू करना।') },
      { btn: 'Run now', does: t('Runs it right away, even if paused.', 'तुरंत चलाता है, भले ही रुका हुआ हो।') },
      { btn: 'Edit / Delete', does: t('Change or remove it. Lights stay as they are.', 'बदलें या हटाएँ। लाइटें जैसी हैं वैसी रहती हैं।') },
    ],
    fieldsTitle: t('Schedule fields', 'Schedule के फ़ील्ड'),
    fields: [
      { name: 'What to switch', meaning: t('A whole road / A group / One light / A tunnel.', 'A whole road / A group / One light / A tunnel।') },
      { name: 'Action', meaning: t('Turn ON, Turn OFF, Set brightness (1–99). For a tunnel: Day / Evening / Night / Off.', 'Turn ON, Turn OFF, Set brightness (1–99)। सुरंग के लिए: Day / Evening / Night / Off।') },
      { name: 'When', meaning: t('At a time (24-hour clock), Sunrise or Sunset, with Minutes 0–180 after or before.', 'At a time (24 घंटे की घड़ी), Sunrise या Sunset, साथ में Minutes 0–180 after या before।') },
      { name: 'Days', meaning: t('Mon…Sun buttons; at least one must be on.', 'Mon…Sun बटन; कम से कम एक चालू होना चाहिए।') },
      { name: 'Enabled', meaning: t('Untick to pause (only when editing).', 'रोकने के लिए untick करें (सिर्फ़ edit करते समय)।') },
    ],
    tips: [
      t('Sunrise/sunset schedules do nothing until the site location is saved.', 'साइट की location सेव होने तक सूर्योदय/सूर्यास्त वाले शेड्यूल कुछ नहीं करते।'),
      t('If you save a time that has already passed today, it first runs tomorrow.', 'अगर आज बीत चुका समय सेव करें तो वह पहली बार कल चलेगा।'),
      t('If the server was down, a missed run is still done up to 20 minutes late; later than that it is skipped for the day.', 'सर्वर बंद रहा हो तो छूटा रन 20 मिनट तक देर से भी हो जाता है; उसके बाद उस दिन के लिए छोड़ दिया जाता है।'),
      t('Disabled lights are skipped. All commands also appear in Logs with role “Scheduler”.', 'Disabled लाइटें छोड़ी जाती हैं। सारे कमांड Logs में भी “Scheduler” role के साथ दिखते हैं।'),
    ],
  },

  /* ---------------------------------------------------------- Status */
  {
    id: 'status', icon: 'status', route: '/status', shot: 'status.jpg',
    title: t('Status', 'Status (स्थिति)'),
    perm: 'status.view',
    tagline: t('A health table of every receiver.', 'हर receiver की सेहत की टेबल।'),
    what: t(
      'A simple table: for each receiver, is it ONLINE, when was it last heard, its brightness, relay 1 and relay 2 state, and the radio signal quality (RSSI = strength, SNR = clarity). The page loads when opened; press Refresh to update.',
      'एक सादी टेबल: हर receiver के लिए — ONLINE है या नहीं, आख़िरी बार कब सुना गया, ब्राइटनेस, relay 1 और relay 2 की स्थिति, और रेडियो सिग्नल की गुणवत्ता (RSSI = ताक़त, SNR = साफ़पन)। पेज खुलने पर लोड होता है; अपडेट के लिए Refresh दबाएँ।',
    ),
    buttons: [{ btn: 'Refresh', does: t('Reads the table again.', 'टेबल फिर से पढ़ता है।') }],
    tips: [
      t('OFFLINE is also shown when nothing has ever been received from a light.', 'अगर किसी लाइट से कभी कुछ न मिला हो तो भी OFFLINE दिखता है।'),
      t('Higher (less negative) RSSI and higher SNR mean a better radio link.', 'RSSI जितना ऊँचा (कम ऋणात्मक) और SNR जितना ज़्यादा, रेडियो लिंक उतना अच्छा।'),
    ],
  },

  /* ---------------------------------------------------------- Logs */
  {
    id: 'logs', icon: 'logs', route: '/logs', shot: 'logs.jpg',
    title: t('Logs (command history)', 'Logs (कमांड का इतिहास)'),
    perm: 'logs.view (own) · logs.view_all',
    tagline: t('Who sent which command, when, and what happened.', 'किसने कब कौन-सा कमांड भेजा और क्या हुआ।'),
    what: t(
      'The audit trail of every command: Time, User, Role, Device, Command, Parameter, Status, RSSI, SNR and Error. The newest 100 are shown. Users with only “View own” see their own commands; Admins see everyone’s. Commands sent to a group or a schedule are listed one light at a time.',
      'हर कमांड का ऑडिट रिकॉर्ड: Time, User, Role, Device, Command, Parameter, Status, RSSI, SNR और Error। ताज़ा 100 दिखते हैं। सिर्फ़ “View own” वाले यूज़र अपने कमांड देखते हैं; Admin सबके। ग्रुप या शेड्यूल से गए कमांड एक-एक लाइट के हिसाब से अलग दिखते हैं।',
    ),
    buttons: [{ btn: 'Refresh', does: t('Reloads the list.', 'सूची फिर से लोड करता है।') }],
    fieldsTitle: t('Status meanings', 'Status का मतलब'),
    fields: [
      { name: 'SUCCESS (green)', meaning: t('The light confirmed exactly this command.', 'लाइट ने ठीक इसी कमांड की पुष्टि की।') },
      { name: 'ACKNOWLEDGED (amber)', meaning: t('The light replied, but not with a matching confirmation.', 'लाइट ने जवाब दिया, पर मेल खाती पुष्टि नहीं थी।') },
      { name: 'NO_ACK (amber)', meaning: t('The transmitter sent it but the light did not answer.', 'transmitter ने भेजा पर लाइट ने जवाब नहीं दिया।') },
      { name: 'TIMEOUT (amber)', meaning: t('Sent through the default MQTT broker and no state change within 10 seconds.', 'डिफ़ॉल्ट MQTT broker से भेजा गया और 10 सेकंड में स्थिति नहीं बदली।') },
      { name: 'SENT_OVER_LORA / SENT_TO_TRANSMITTER / QUEUED (blue)', meaning: t('On its way; waiting for the reply.', 'रास्ते में है; जवाब का इंतज़ार।') },
      { name: 'PARTIAL_SUCCESS (amber)', meaning: t('Group result: some lights failed.', 'ग्रुप का नतीजा: कुछ लाइटें फ़ेल हुईं।') },
      { name: 'FAILED / TRANSMITTER_OFFLINE / DEVICE_OFFLINE (red)', meaning: t('Could not deliver: wrong IP/port, unreachable transmitter, or the device/transmitter is switched to Disabled. See the Error column.', 'पहुँचा नहीं सके: गलत IP/port, transmitter नहीं मिला, या डिवाइस/transmitter Disabled है। Error कॉलम देखें।') },
      { name: 'INVALID_COMMAND / INVALID_PARAMETER (red)', meaning: t('Bad request, e.g. brightness outside 1–99.', 'गलत अनुरोध, जैसे ब्राइटनेस 1–99 से बाहर।') },
    ],
    tips: [t('Blocked commands (disabled device, bad value) are logged too.', 'रुके हुए कमांड (disabled डिवाइस, गलत मान) भी लॉग होते हैं।')],
  },

  /* ---------------------------------------------------------- Configuration */
  {
    id: 'configuration', icon: 'config', route: '/configuration', shot: 'configuration.jpg',
    title: t('Configuration', 'Configuration (कॉन्फ़िगरेशन)'),
    perm: 'configuration.view · edit (Admin)',
    tagline: t('How often lights are asked for their state.', 'लाइटों से उनकी स्थिति कितनी बार पूछी जाए।'),
    what: t(
      'System settings for status monitoring. Change them only if you know why; the defaults work for most sites.',
      'स्टेटस मॉनिटरिंग की सिस्टम सेटिंग। वजह पता हो तभी बदलें; ज़्यादातर साइटों पर डिफ़ॉल्ट ठीक चलते हैं।',
    ),
    tasks: [{ title: t('Change a setting', 'सेटिंग बदलना'), steps: [t('Edit the value, then click Save configuration. “Configuration saved.” appears.', 'मान बदलें, फिर Save configuration दबाएँ। “Configuration saved.” दिखेगा।')] }],
    fieldsTitle: t('Fields', 'फ़ील्ड'),
    fields: [
      { name: 'Status monitoring enabled', meaning: t('Master switch for checking lights’ state.', 'लाइटों की स्थिति जाँचने का मुख्य स्विच।') },
      { name: 'Polling interval (s)', meaning: t('How often receivers that have a Status command are asked for their state. Empty = 10 s, minimum 3 s. Smaller = fresher map but more radio traffic.', 'जिन receivers के पास Status command है उनसे कितनी बार स्थिति पूछी जाए। खाली = 10 सेकंड, न्यूनतम 3 सेकंड। कम = नक्शा ताज़ा पर रेडियो ट्रैफ़िक ज़्यादा।') },
      { name: 'Response timeout (s)', meaning: t('How long to wait for an answer.', 'जवाब का कितना इंतज़ार करना है।') },
      { name: 'Retry count', meaning: t('How many times to retry.', 'कितनी बार दोबारा कोशिश करनी है।') },
      { name: 'Offline threshold (s)', meaning: t('Silence longer than this marks a light offline (placeholder 90 s).', 'इससे ज़्यादा चुप्पी पर लाइट offline मानी जाती है (डिफ़ॉल्ट 90 सेकंड)।') },
      { name: 'Status polling mode', meaning: t('Advanced text value; leave as is.', 'उन्नत टेक्स्ट मान; जैसा है वैसा रहने दें।') },
    ],
    tips: [t('Two silent polls in a row make a light offline; a good reply makes it online again.', 'लगातार दो बार चुप रहने पर लाइट offline हो जाती है; एक अच्छा जवाब उसे फिर online कर देता है।')],
  },

  /* ---------------------------------------------------------- Users */
  {
    id: 'users', icon: 'users', route: '/users', shot: 'users.jpg', extraShots: [{ file: 'users-permissions.jpg', cap: t('Setting a user’s permissions', 'यूज़र की अनुमतियाँ सेट करना') }],
    title: t('Users & permissions', 'Users (यूज़र और अनुमतियाँ)'),
    perm: 'users.view · create · edit (Admin)',
    tagline: t('Create users and decide exactly what each can do.', 'यूज़र बनाएँ और तय करें कि हर कोई ठीक क्या कर सकता है।'),
    what: t(
      'Every person gets their own login. A Role gives a starting set of permissions; you can then tick or untick each permission per module. Changes apply immediately, even if the person is signed in.',
      'हर व्यक्ति का अपना लॉगिन होता है। Role शुरुआती अनुमतियों का सेट देता है; फिर आप हर मॉड्यूल की अनुमति अलग से tick/untick कर सकते हैं। बदलाव तुरंत लागू होते हैं, भले ही व्यक्ति लॉगिन हो।',
    ),
    tasks: [
      {
        title: t('Create a user', 'यूज़र बनाना'),
        steps: [
          t('Under the table fill Username (3–64 letters, digits or . _ @ -), Password (at least 8 characters) and Role.', 'टेबल के नीचे Username (3–64 अक्षर, अंक या . _ @ -), Password (कम से कम 8 अक्षर) और Role भरें।'),
          t('Click + Create user. The person can sign in right away.', '+ Create user दबाएँ। व्यक्ति तुरंत साइन-इन कर सकता है।'),
        ],
      },
      {
        title: t('Fine-tune permissions', 'अनुमतियाँ बारीकी से तय करना'),
        steps: [
          t('Click Permissions on the user’s row.', 'यूज़र की पंक्ति में Permissions दबाएँ।'),
          t('Pick a Role (this loads its template), then tick the boxes. The module name ticks all its actions.', 'Role चुनें (इससे उसका टेम्पलेट लोड होता है), फिर बॉक्स tick करें। मॉड्यूल का नाम tick करने से उसके सारे actions tick हो जाते हैं।'),
          t('Click Save permissions. “Reset to role default” removes your custom changes.', 'Save permissions दबाएँ। “Reset to role default” आपके कस्टम बदलाव हटा देता है।'),
        ],
      },
      {
        title: t('Stop someone from signing in', 'किसी को साइन-इन से रोकना'),
        steps: [t('Click Disable on the row. They are blocked at once. Enable brings them back.', 'पंक्ति में Disable दबाएँ। वे तुरंत रुक जाते हैं। Enable से वापस।')],
      },
    ],
    fieldsTitle: t('Roles', 'Roles'),
    fields: [
      { name: 'Admin', meaning: t('Everything. Cannot be reduced.', 'सब कुछ। घटाया नहीं जा सकता।') },
      { name: 'Operator', meaning: t('Day-to-day control: view everything operational, switch lights and groups, test devices, switch tunnels, run schedules, acknowledge alarms, export reports, see own logs. Cannot add devices, design roads, edit plans, change configuration or manage users.', 'रोज़मर्रा का संचालन: सब देखना, लाइट और ग्रुप चलाना, डिवाइस टेस्ट, सुरंग बदलना, schedule चलाना, अलार्म acknowledge, रिपोर्ट export, अपने लॉग देखना। डिवाइस जोड़ना, रोड डिज़ाइन, plans बदलना, configuration या यूज़र मैनेज नहीं कर सकता।') },
      { name: 'User (view only)', meaning: t('Can look at Dashboard, Devices, Control, Groups, Alarms, Plans, Sensors, Tunnels, Schedules and Status, but change nothing.', 'Dashboard, Devices, Control, Groups, Alarms, Plans, Sensors, Tunnels, Schedules और Status देख सकता है, कुछ बदल नहीं सकता।') },
    ],
    tips: [
      t('You cannot change your own role, status or permissions.', 'आप अपना खुद का role, status या permissions नहीं बदल सकते।'),
      t('“custom” (amber) in the Access column means that person’s permissions differ from their role template.', 'Access कॉलम में “custom” (पीला) का मतलब है कि उस व्यक्ति की अनुमतियाँ उनके role टेम्पलेट से अलग हैं।'),
      t('Logs: “View own” shows only that user’s commands; “View everyone’s” shows all.', 'Logs: “View own” सिर्फ़ उसी यूज़र के कमांड दिखाता है; “View everyone’s” सबके।'),
    ],
  },
];

/* ----- Chapters after the module list ----- */
export const OUTRO = [
  {
    id: 'troubleshooting',
    icon: 'alarms',
    title: t('Troubleshooting', 'समस्या-समाधान (Troubleshooting)'),
    table: [
      [t('A light stays grey (“No data”)', 'लाइट ग्रे (“No data”) रहती है'), t('No Status command set on the receiver, or the transmitter is Disabled. Set a Status command in Devices → edit receiver.', 'receiver पर Status command नहीं है, या transmitter Disabled है। Devices → edit receiver में Status command सेट करें।')],
      [t('Everything behind one transmitter is red', 'एक transmitter के पीछे सब कुछ लाल है'), t('The transmitter cannot be reached. Devices → Test (antenna icon): Ping and Check port; check power, cable, Wi-Fi.', 'transmitter तक नहीं पहुँच पा रहे। Devices → Test (एंटीना आइकन): Ping और Check port; बिजली, केबल, Wi-Fi जाँचें।')],
      [t('Command shows NO_ACK', 'कमांड NO_ACK दिखाता है'), t('The transmitter got it but the light did not answer: weak radio signal, wrong network address, or light powered off.', 'transmitter को मिला पर लाइट ने जवाब नहीं दिया: कमज़ोर रेडियो सिग्नल, गलत network address या लाइट बंद।')],
      [t('Commands fail one after another', 'कमांड एक के बाद एक फ़ेल होते हैं'), t('Another server may be talking to the same transmitter. Only one server per site.', 'शायद कोई दूसरा सर्वर उसी transmitter से बात कर रहा है। हर साइट पर एक ही सर्वर।')],
      [t('Brightness rejected', 'ब्राइटनेस अस्वीकार'), t('Use a whole number from 1 to 99.', '1 से 99 का पूरा नंबर इस्तेमाल करें।')],
      [t('Sunset schedule never runs', 'सूर्यास्त वाला schedule नहीं चलता'), t('Save the site location in Schedules → Location & time zone.', 'Schedules → Location & time zone में साइट की location सेव करें।')],
      [t('A menu item is missing', 'कोई मेन्यू नहीं दिखता'), t('You do not have that permission. Ask your Admin (Users page).', 'आपके पास वह अनुमति नहीं है। Admin से कहें (Users पेज)।')],
      [t('Cost shows “—” in Reports', 'Reports में खर्च “—” दिखता है'), t('Set Electricity price, and enter watts on receivers.', 'Electricity price सेट करें और receivers पर watts भरें।')],
    ],
  },
  {
    id: 'glossary',
    icon: 'logs',
    title: t('Quick glossary', 'छोटा शब्दकोश'),
    table: [
      ['LoRa', t('Long-range radio used between transmitter and receivers.', 'ट्रांसमीटर और रिसीवर के बीच लंबी दूरी का रेडियो।')],
      ['MQTT', t('A message system (“broker”) that devices use to talk to the software.', 'संदेश भेजने की प्रणाली (“broker”) जिससे डिवाइस सॉफ़्टवेयर से बात करते हैं।')],
      ['LAN', t('Ordinary office/site network by cable or Wi-Fi.', 'केबल या Wi-Fi का साधारण ऑफ़िस/साइट नेटवर्क।')],
      ['ACK', t('“Acknowledged”: the light confirms it received the command.', '“Acknowledged”: लाइट पुष्टि करती है कि उसे कमांड मिला।')],
      ['RSSI / SNR', t('Radio signal strength / clarity.', 'रेडियो सिग्नल की ताक़त / साफ़पन।')],
      ['Polling', t('Asking each light “what is your state?” again and again.', 'हर लाइट से बार-बार पूछना “तुम्हारी स्थिति क्या है?”।')],
      ['DWG / DXF', t('Engineering drawing file formats from CAD software.', 'CAD सॉफ़्टवेयर की इंजीनियरिंग ड्रॉइंग फ़ाइल के फ़ॉर्मैट।')],
      ['kWh', t('Unit of electrical energy (one “unit” on your bill).', 'बिजली की ऊर्जा की इकाई (बिल का एक “यूनिट”)।')],
    ],
  },
];
