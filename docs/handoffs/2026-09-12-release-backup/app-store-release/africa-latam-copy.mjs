import{request}from'./asc-api.mjs';
const renewal=`Choose a monthly or annual auto-renewing subscription. Payment is charged to your Apple Account when you confirm purchase. Subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Manage or cancel in your App Store account settings.`;
const latam=`You understand your abuela. Now answer her back.

Bolo! is built for people who grew up hearing Spanish, Portuguese, or an Indigenous language at home and answered back in English. Reconnect with the words you know and build confidence saying them out loud. Start with everyday greetings and keep going, one stop at a time.

SIX LANGUAGES
Spanish
Portuguese (Brazilian)
Nahuatl
Quechua
Guarani
Yucatec Maya

THE ROUTE IS THE LESSON
Ride a minibus journey inspired by the way people move across Latin America. Visit the Mercadito, learn with Abuela along the way, and say your answers out loud. Bolo listens and gives pronunciation feedback.

FIND YOUR VOICE
Chat with Bolo, try an in-app phone call with Abuela, read illustrated storybooks and play language games. Revisit your phrasebook, track your progress and build your streak.

START FREE. GO AS FAR AS YOU WANT.
Zone 1 is free in every language. Unlock later zones with Bolo! All-Access, or use Cacao to purchase individual stops in order. Earn Cacao through practice or buy optional currency packs.

ALL-ACCESS
${renewal}

AI speaking and conversation features require your consent. Microphone access is needed for speaking activities.

Bring home your voice.

Privacy Policy: https://bolo-latam.app/privacy
Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`;
const esRenewal=`Elige una suscripción mensual o anual con renovación automática. El pago se carga a tu cuenta de Apple al confirmar la compra. La suscripción se renueva automáticamente, a menos que la canceles al menos 24 horas antes de que termine el periodo actual. Puedes gestionarla o cancelarla en la configuración de tu cuenta del App Store.`;
const latamEs=`Entiendes a tu abuela. Ahora respóndele.

Bolo! te ayuda a reconectar con los idiomas que escuchabas en casa y a ganar confianza al hablar. Empieza con saludos cotidianos y avanza a tu ritmo, una parada a la vez.

SEIS IDIOMAS
Español, portugués de Brasil, náhuatl, quechua, guaraní y maya yucateco.

LA RUTA ES LA LECCIÓN
Recorre una ruta en minibús con lecciones, cuentos y actividades. Visita el Mercadito, aprende con Abuela y responde en voz alta. Bolo escucha y te da comentarios sobre tu pronunciación.

ENCUENTRA TU VOZ
Conversa con Bolo, prueba una llamada dentro de la app con Abuela y practica con juegos y cuentos ilustrados. Repasa tu vocabulario, sigue tu progreso y mantén tu racha.

EMPIEZA GRATIS EN CADA IDIOMA
La Zona 1 es gratis en todos los idiomas. Continúa con All-Access o usa Cacao para comprar paradas individuales en orden. Puedes ganar Cacao practicando o comprar paquetes opcionales.

ALL-ACCESS
${esRenewal}

Las funciones de conversación y práctica oral con IA requieren tu consentimiento. Las actividades de voz necesitan acceso al micrófono.

Política de privacidad: https://bolo-latam.app/privacy
Términos de uso: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`;
const africaEs=`Encuentra tu voz en los idiomas de África. Practica hablando, leyendo cuentos y conversando, una parada a la vez.

DIEZ IDIOMAS
Amárico, tigriña, somalí, oromo, hausa, yoruba, igbo, árabe egipcio, suajili y zulú.

SIGUE TU RUTA
Recorre una ruta en minibús con lecciones y actividades. Escucha una palabra o frase, mantén pulsado el micrófono y dilo en voz alta. Recibe comentarios sobre tu pronunciación y vuelve a practicar a tu ritmo.

CONVERSA CON BOLO
Habla con tu compañero loro y prueba una llamada dentro de la app con Mama. Lee cuentos ilustrados, juega y repasa las frases que has aprendido.

HAZ DE LA PRÁCTICA UN HÁBITO
Sigue tu progreso, mantén tu racha y gana Cowries. Visita Mama's Stall para gastar tu moneda en artículos y desbloqueos disponibles.

EMPIEZA GRATIS EN CADA IDIOMA
La Zona 1 es gratis en todos los idiomas. Continúa con All-Access o usa Cowries para comprar paradas individuales en orden. También hay paquetes de moneda opcionales.

ALL-ACCESS
${esRenewal}

Las funciones de conversación y práctica oral con IA requieren tu consentimiento. Las actividades de voz necesitan acceso al micrófono.

Política de privacidad: https://bolo-africa.app/privacy
Términos de uso: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`;
for(const [id,description,region,keywords]of[
['5539f723-f408-4149-9137-c0c1cf81ab84',latam,'latam',null],
['9a1a1e60-bd28-480f-88e9-24da0ad59403',latamEs,'latam','quichua,mayan,yucatec,vocabulary,conversation,family,lessons,reading,nahuatl,guarani,heritage'],
['2b6e6d43-7f6a-454e-a394-75a6839174e4',africaEs,'africa',null]]){
const attributes={description,supportUrl:`https://bolo-${region}.app/support.html`,marketingUrl:`https://bolo-${region}.app`};if(keywords)attributes.keywords=keywords;
await request('/v1/appStoreVersionLocalizations/'+id,'PATCH',{data:{type:'appStoreVersionLocalizations',id,attributes}});console.log(region,id,'description saved');}
for(const[info,region]of[['dda8dbe8-7205-43f5-9cbf-6b808481bf87','africa'],['87097af1-dada-4f27-9c7c-2d31892fcc5d','latam']])for(const l of(await request('/v1/appInfos/'+info+'/appInfoLocalizations')).data){if(!l.attributes.privacyPolicyUrl)await request('/v1/appInfoLocalizations/'+l.id,'PATCH',{data:{type:l.type,id:l.id,attributes:{privacyPolicyUrl:`https://bolo-${region}.app/privacy`}}});console.log(region,l.attributes.locale,'privacy checked');}
