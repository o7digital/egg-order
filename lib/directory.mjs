const assignments = [
 ['Christian Garcia','christian.garcia@gallogiro.com'], ['Olivier Steineur','olivier.steineur@gmail.com'], ['Miguel Solis','msolis@gallogiro.com'], ['Charles Bonaparte','charles.bonaparte.wyse@gmail.com'], ['Aamer Latif','aamer.latif@artimexbakery.com'],
 ['Mario Cortez','egg-bellflower@gallogiro.com','EGG Bristol'], ['Karla Lopez','egg-pacific@gallogiro.com','EGG Pacific'], ['Jose Montano','egg-ela@gallogiro.com','EGG ELA'], ['Griselda Gomez','egg-lynwood@gallogiro.com','EGG Lynwood'], ['Jorge Mercado','egg-fontana@gallogiro.com','EGG Fontana'], ['Francisco Abundis','egg-canoga@gallogiro.com','EGG Canoga'], ['Alma Flores','egg-bellflower@gallogiro.com','EGG Bellflower'], ['Angel Plascencia','egg-sanfernando@gallogiro.com','EGG San Fernando'], ['Anabelle Espinoza','egg-anaheim@gallogiro.com','EGG Anaheim'], ['Javier Padilla','egg-vannuys@gallogiro.com','EGG Van Nuys']
].map(([name,email,restaurant]) => ({name,email,restaurant,role:restaurant?'manager':'superuser'}));

export const directory = Object.values(assignments.reduce((result,u)=>{
 if(!result[u.email]) result[u.email]={...u,restaurants:[],managers:[]};
 if(u.restaurant) {result[u.email].restaurants.push(u.restaurant);result[u.email].managers.push({name:u.name,restaurant:u.restaurant});}
 return result;
},{}));
