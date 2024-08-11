// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPuImsiUJ4wIQFU84GNqn7kt_MFGGRDW8",
    authDomain: "ghanaride-2de0c.firebaseapp.com",
    projectId: "ghanaride-2de0c",
    storageBucket: "ghanaride-2de0c.appspot.com",
    messagingSenderId: "339091042368",
    appId: "1:339091042368:web:ce277932b74202a771afa5",
    measurementId: "G-FTW2SE5TEW"
  };
  
  
  // Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let map;
      let directionsService;
      let directionsRenderers = {};
      let markers = {};
      let activeRouteId = null;

      const difficultyColors = {
        easy: '#00FF00',
        moderate: '#FFA500',
        difficult: '#FF0000',
      };

      function initMap() {
        const defaultLocation = { lat: 40.7128, lng: -74.0060 };
        map = new google.maps.Map(document.getElementById('map'), {
          zoom: 12,
          center: defaultLocation,
        });

        directionsService = new google.maps.DirectionsService();

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(position => {
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            map.setCenter(userLocation);
            new google.maps.Marker({
              position: userLocation,
              map,
              title: 'You are here',
            });
          }, () => handleLocationError(true, map.getCenter()));
        } else {
          handleLocationError(false, map.getCenter());
        }

        setupFirestoreListener();

        document.getElementById('show-all-btn').addEventListener('click', showAllRoutes);
        document.getElementById('plan-trip').addEventListener('click', planTrip);

        const startInput = document.getElementById('start');
        const endInput = document.getElementById('end');
        new google.maps.places.Autocomplete(startInput).bindTo('bounds', map);
        new google.maps.places.Autocomplete(endInput).bindTo('bounds', map);

        document.getElementById('add-stop-btn').addEventListener('click', addStop);
      }

      function handleLocationError(browserHasGeolocation, pos) {
        const errorMessage = browserHasGeolocation
          ? 'Error: The Geolocation service failed.'
          : "Error: Your browser doesn't support geolocation.";
        console.log(errorMessage);
      }

      function setupFirestoreListener() {
        db.collection('busRoutes').onSnapshot(snapshot => {
          snapshot.docChanges().forEach(change => {
            const routeId = change.doc.id;
            if (change.type === 'added' || change.type === 'modified') {
              const route = change.doc.data();
              updateRouteOnMap(routeId, route);
            }
            if (change.type === 'removed') {
              removeRouteFromMap(routeId);
            }
          });
        });
      }

      function updateRouteOnMap(routeId, route) {
        if (activeRouteId && activeRouteId === routeId) {
          fetchAndDisplayRoute(routeId);
        }

        // Update the sidebar with the new or modified route
        const routeElement = document.getElementById(routeId);
        if (routeElement) {
          routeElement.querySelector('.route-info').innerHTML = `Driver: ${route.driver}<br>Bus Number: ${route.routeID}`;
        } else {
          const newRouteElement = createRouteElement(route, routeId);
          document.getElementById('sidebar').appendChild(newRouteElement);
        }
      }

      function removeRouteFromMap(routeId) {
        if (directionsRenderers[routeId]) {
          directionsRenderers[routeId].setMap(null);
          delete directionsRenderers[routeId];
        }
        if (markers[routeId]) {
          markers[routeId].forEach(marker => marker.setMap(null));
          delete markers[routeId];
        }

        const routeElement = document.getElementById(routeId);
        if (routeElement) {
          routeElement.remove();
        }
      }

      async function loadRoutes() {
        const routesSnapshot = await db.collection('busRoutes').get();
        const sidebar = document.getElementById('sidebar');

        routesSnapshot.forEach(doc => {
          const route = doc.data();
          const routeId = doc.id;
          const routeElement = createRouteElement(route, routeId);
          sidebar.appendChild(routeElement);
        });
      }

      function createRouteElement(route, routeId) {
        const routeElement = document.createElement('div');
        routeElement.textContent = route.name;
        routeElement.classList.add('route');

        const routeInfoElement = document.createElement('div');
        routeInfoElement.classList.add('route-info');
        routeInfoElement.innerHTML = `Driver: ${route.driver}<br>Bus Number: ${route.routeID}`;

        routeElement.appendChild(routeInfoElement);
        routeElement.id = routeId;

        routeElement.addEventListener('click', () => {
          handleRouteClick(routeElement, routeInfoElement, routeId);
        });

        return routeElement;
      }

      function handleRouteClick(routeElement, routeInfoElement, routeId) {
        if (activeRouteId) {
          document.getElementById(activeRouteId).classList.remove('active');
          document.getElementById(activeRouteId).querySelector('.route-info').classList.remove('active');
          if (directionsRenderers[activeRouteId]) {
            directionsRenderers[activeRouteId].setMap(null);
          }
          if (markers[activeRouteId]) {
            markers[activeRouteId].forEach(marker => marker.setMap(null));
          }
        }

        activeRouteId = routeId;
        routeElement.classList.add('active');
        routeInfoElement.classList.add('active');
        fetchAndDisplayRoute(routeId);

        // Show rating popup at the first stop's position
        const firstStop = markers[routeId] && markers[routeId][0] ? markers[routeId][0].getPosition() : map.getCenter();
        showRatingPopup(routeId, firstStop);
      }

      async function showAllRoutes() {
        const routesSnapshot = await db.collection('busRoutes').get();

        routesSnapshot.forEach(doc => {
          const routeId = doc.id;
          const routeElement = document.getElementById(routeId);
          if (!routeElement.classList.contains('active')) {
            routeElement.classList.add('active');
            routeElement.querySelector('.route-info').classList.add('active');
            fetchAndDisplayRoute(routeId);
          }
        });
      }

      async function fetchAndDisplayRoute(routeId) {
        const routeDoc = await db.collection('busRoutes').doc(routeId).get();
        if (!routeDoc.exists) {
          console.error('No such document!');
          return;
        }

        const route = routeDoc.data();
        const stops = route.stops;
        const difficulty = route.difficulty || 'easy';
        const color = difficultyColors[difficulty];

        if (directionsRenderers[routeId]) {
          directionsRenderers[routeId].setMap(null);
        }

        const directionsRenderer = new google.maps.DirectionsRenderer({
          map: map,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 4,
          },
        });

        directionsRenderers[routeId] = directionsRenderer;
        markers[routeId] = [];

        const waypoints = stops.slice(1, -1).map(stop => ({
          location: new google.maps.LatLng(stop.coordinates.latitude, stop.coordinates.longitude),
          stopover: true,
        }));

        const request = {
          origin: new google.maps.LatLng(stops[0].coordinates.latitude, stops[0].coordinates.longitude),
          destination: new google.maps.LatLng(stops[stops.length - 1].coordinates.latitude, stops[stops.length - 1].coordinates.longitude),
          waypoints: waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
        };

        directionsService.route(request, (response, status) => {
          if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(response);
            displayMarkers(stops, routeId);
          } else {
            console.error('Directions request failed due to ' + status);
          }
        });
      }

      function displayMarkers(stops, routeId) {
        stops.forEach(stop => {
          const marker = new google.maps.Marker({
            position: { lat: stop.coordinates.latitude, lng: stop.coordinates.longitude },
            map: map,
            title: stop.name,
            icon: {
              url: 'https://maps.google.com/mapfiles/ms/icons/bus.png',
              scaledSize: new google.maps.Size(32, 32),
            },
          });

          markers[routeId].push(marker);

          const stopInfoWindow = new google.maps.InfoWindow({
            content: `
              <div>
                <strong>${stop.name}</strong><br>
                Accessibility Options: ${(stop['disability options'] || []).join(', ')}
              </div>`,
          });

          marker.addListener('click', () => {
            stopInfoWindow.open(map, marker);
          });
        });
      }

      async function showRatingPopup(routeId, position) {
        const contentString = `
          <div id="rating-popup">
            <h4>Rate this route</h4>
            <button class="rating-btn" data-route-id="${routeId}" data-rating="easy">Easy</button>
            <button class="rating-btn" data-route-id="${routeId}" data-rating="moderate">Moderate</button>
            <button class="rating-btn" data-route-id="${routeId}" data-rating="difficult">Difficult</button>
          </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
          content: contentString,
          position: position,
        });

        infoWindow.open(map);

        google.maps.event.addListenerOnce(infoWindow, 'domready', function () {
          document.querySelectorAll('.rating-btn').forEach(button => {
            button.addEventListener('click', function () {
              const rating = this.dataset.rating;
              updateRouteRating(routeId, rating);
              infoWindow.close();
            });
          });
        });
      }

      async function updateRouteRating(routeId, rating) {
        try {
          await db.collection('busRoutes').doc(routeId).update({
            difficulty: rating
          });
          console.log(`Route ${routeId} rated as ${rating}`);
        } catch (error) {
          console.error(`Error updating route ${routeId}: `, error);
        }
      }

      async function addStop() {
        const stopName = document.getElementById('stop-name').value;
        const accessibilityOptions = document.getElementById('accessibility-options').value.split(',').map(option => option.trim());

        if (stopName === '' || accessibilityOptions.length === 0) {
          alert('Please enter both stop name and accessibility options.');
          return;
        }

        const newStop = {
          name: stopName,
          coordinates: {
            latitude: map.getCenter().lat(),  // For simplicity, using map center as the stop location. Modify as needed.
            longitude: map.getCenter().lng()
          },
          'disability options': accessibilityOptions,
        };

        try {
          const routeDoc = await db.collection('busRoutes').doc(activeRouteId).get();
          if (!routeDoc.exists) {
            console.error('No such document!');
            return;
          }

          const route = routeDoc.data();
          route.stops.push(newStop);

          await db.collection('busRoutes').doc(activeRouteId).update({ stops: route.stops });
          console.log('Stop added successfully');
        } catch (error) {
          console.error('Error adding stop: ', error);
        }
      }

      function planTrip() {
        const start = document.getElementById('start').value;
        const end = document.getElementById('end').value;
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;

        const directionsRenderer = new google.maps.DirectionsRenderer({ map: map });

        calculateAndDisplayRoute(directionsService, directionsRenderer, start, end, date, time);
      }

      function calculateAndDisplayRoute(directionsService, directionsRenderer, start, end, date, time) {
        const selectedMode = 'DRIVING';
        directionsService.route(
          {
            origin: start,
            destination: end,
            travelMode: google.maps.TravelMode[selectedMode],
            drivingOptions: { departureTime: new Date(`${date}T${time}`) },
          },
          (response, status) => {
            if (status === 'OK') {
              directionsRenderer.setDirections(response);
              displayTravelTime(response);
            } else {
              window.alert('Directions request failed due to ' + status);
            }
          }
        );
      }

      function displayTravelTime(response) {
        const route = response.routes[0];
        const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);
        const durationElement = document.createElement('div');
        durationElement.classList.add('total-duration');
        durationElement.innerHTML = `<b>Estimated Travel Time: ${Math.floor(totalDuration / 60)} minutes</b>`;

        const directionsPanel = document.getElementById('directions-panel');
        directionsPanel.insertBefore(durationElement, directionsPanel.firstChild);
      }

google.maps.event.addDomListener(window, 'load', initMap);
