from flask import Flask, render_template, request, jsonify, g
import firebase_admin
from flask_login import current_user, UserMixin, login_user, login_required, logout_user, LoginManager
from firebase_admin import credentials, firestore
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS as Cors

app = Flask(__name__)
Cors(app)

cred = credentials.Certificate("ghanaride-2de0c-firebase-adminsdk-8xgi9-1b2073e567.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

login_manager = LoginManager()
login_manager.init_app(app)

class User(UserMixin):
    def __init__(self, id, email):
        self.id = id
        self.email = email

@login_manager.user_loader
def load_user(user_id):
    user_ref = db.collection('users').document(user_id)
    user = user_ref.get()
    if user.exists:
        user = user.to_dict()
        return User(id=user_id, email=user['email'])
    return None

####################--Pages--####################
@app.route('/')
def index():
    return render_template('index.html', user=current_user)

@app.route('/loginpage')
def login_page():
    return render_template('login.html')

@app.route('/signuppage')
def signup():
    return render_template('signup.html')


@app.route('/routepage')
def routepage():
    return render_template('routes.html')

@app.route('/drivers')
def drivers():
    return render_template('drivers.html')

@app.route('/set_preferences')
def set_preferences():
    return render_template('set_preferences.html')


####################--API Functions--####################
@app.route('/register', methods=['POST'])
def register():
    data = request.json
    user_ref = db.collection('users').document()
    hashed_password = generate_password_hash(data['password'])
    new_user = {
        'email': data['email'],
        'password': hashed_password,
        'name': data['name'],
        'phone': data['phone'],
    }

    try:
        user_ref.set(new_user)
        return jsonify({"message": "User registered successfully!", "user": new_user}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user_ref = db.collection('users')
    user = user_ref.where('email', '==', data['email']).get()
    if not user:
        return jsonify({"error": "User not found!"}), 404
    user = user[0].to_dict()
    if not check_password_hash(user['password'], data['password']):
        return jsonify({"error": "Invalid password!"}), 401
    return jsonify({"message": "Login successful!", "user": user}), 200


@app.route('/get_routes', methods=['GET'])
def get_routes():
    routes_ref = db.collection('busRoutes')
    routes = []
    for doc in routes_ref.stream():
        route = doc.to_dict()
        for stop in route['stops']:
            if isinstance(stop['coordinates'], firestore.GeoPoint):
                stop['coordinates'] = {'lat': stop['coordinates'].latitude, 'lng': stop['coordinates'].longitude}
        routes.append(route)
    return jsonify(routes)

@app.route('/add_route', methods=['POST'])
def add_route():
    data = request.json
    route_ref = db.collection('busRoutes').document()

    stops = [
        {
            'coordinates': firestore.GeoPoint(stop['coordinates']['latitude'], stop['coordinates']['longitude']),
            'name': stop['name'],
            'stopID': stop['stopID'],
            'disabilityOptions': stop.get('disabilityOptions', [])
        }
        for stop in data['stops']
    ]
    new_route = {
        'busNum': data['busNum'],
        'name': data['name'],
        'driver': data.get('driver', 'Unknown'),
        'difficulty': data.get('difficulty', 'Unknown'),
        'stops': stops
    }
    route_ref.set(new_route)
    return jsonify(new_route), 201

@app.route('/get_drivers', methods=["GET"])
def get_drivers():
    drivers_ref = db.collection('drivers')
    routes_ref = db.collection('busRoutes')

    routes = {doc.id: doc.to_dict() for doc in routes_ref.stream()}

    drivers = []
    for doc in drivers_ref.stream():
        driver = doc.to_dict()
        driver['driver_id'] = doc.id
        driver['route_name'] = route.get('name', 'Unknown') if (route := routes.get(driver['routeID'])) else 'Unknown'

        reviews_ref = db.collection('drivers').document(doc.id).collection('reviews')
        reviews = [review.to_dict() for review in reviews_ref.stream()]
        driver['reviews'] = reviews

        drivers.append(driver)
    return jsonify(drivers)

@app.route('/update_driver_rating', methods=["POST"])
def update_driver_rating():
    try:
        data = request.json
        driver_id = data.get('driver_id')
        new_rating = data.get('new_rating')
        driver_ref = db.collection('drivers').document(driver_id)
        driver_ref.update({'rating': new_rating})
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/add_review', methods=["POST"])
def add_review():
    try:
        data = request.json
        driver_id = data.get('driver_id')
        review = data.get('review')
        reviews_ref = db.collection('drivers').document(driver_id).collection('reviews')
        reviews_ref.add(review)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
