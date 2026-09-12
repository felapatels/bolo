import{request}from'./asc-api.mjs';
const description=`Habla el idioma de Asia Oriental que te conecta con tu familia, tu cultura y tu vida diaria. Bolo reúne práctica oral, historias y conversaciones en un viaje por el agua.

DIEZ IDIOMAS
Explora cantonés, mandarín, coreano, japonés, taishanés, hokkien taiwanés, teochew, fuzhounés, shanghainés y hakka. Practica palabras y frases útiles a tu ritmo.

SIGUE TU VIAJE
Avanza por lecciones y actividades inspiradas en puertos, mercados y festivales. Escucha, practica en voz alta y repasa lo aprendido en tu libro de frases. La compatibilidad del reconocimiento de voz varía según el idioma.

MÁS FORMAS DE APRENDER
Conversa con Bolo, tu compañero loro, y prueba el juego de llamadas con el personaje mayor. Lee y escucha historias ilustradas, juega y sigue tu progreso. Gana Cha y úsalo en artículos y desbloqueos disponibles.

EMPIEZA GRATIS EN TODOS LOS IDIOMAS
La Zona 1 es gratis en todos los idiomas. Continúa con All-Access o usa Cha para comprar paradas individuales en orden. Los paquetes de moneda son compras opcionales dentro de la app.

ALL-ACCESS
Elige una suscripción mensual o anual con renovación automática para acceder a todos los idiomas, zonas del viaje, juegos e historias. El pago se carga a tu cuenta de Apple al confirmar la compra. La suscripción se renueva automáticamente salvo que la canceles al menos 24 horas antes de que termine el periodo actual. Puedes administrar o cancelar la suscripción en la configuración de tu cuenta del App Store.

Las funciones de inteligencia artificial requieren tu consentimiento. Las actividades de voz necesitan acceso al micrófono.

Política de privacidad: https://bolo-east.app/privacy
Términos de uso: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`;
await request('/v1/appStoreVersionLocalizations/b6b820e9-60a2-483e-990d-78140a588cde','PATCH',{data:{type:'appStoreVersionLocalizations',id:'b6b820e9-60a2-483e-990d-78140a588cde',attributes:{description,supportUrl:'https://bolo-east.app/support.html',marketingUrl:'https://bolo-east.app'}}});console.log('Spanish description and links saved; keywords preserved');
const en=(await request('/v1/appStoreVersionLocalizations/7a90b3f2-3e14-4ebe-9fe8-2c8193bb5f25')).data;
await request('/v1/appStoreVersionLocalizations/'+en.id,'PATCH',{data:{type:en.type,id:en.id,attributes:{description:en.attributes.description.replaceAll('tea currency','Cha')}}});console.log('English currency name corrected');
