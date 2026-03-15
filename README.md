# Unicall Backend API

This is the Express.js backend API for the Unicall application with MongoDB and JWT authentication.

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Copy the `.env` file and update the values:
```bash
PORT=5000
MONGODB_URI=mongodb://localhost:27017/unicall
JWT_SECRET=your_super_secure_jwt_secret_key_here_change_this_in_production
JWT_EXPIRE=7d
NODE_ENV=development
```

4. Start MongoDB (if running locally)

5. Seed the database with sample data:
```bash
npm run seed
```

6. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:5000`

### API Documentation

#### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user profile

#### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user

#### Clients
- `GET /api/clients` - Get clients (users see own, admins see all)
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client (users only)
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/stats/dashboard` - Get client statistics

#### Lead Forms (Admin can create, all can view)
- `GET /api/lead-forms` - Get all lead forms
- `GET /api/lead-forms/:id` - Get lead form by ID
- `POST /api/lead-forms` - Create new lead form (admin only)
- `PUT /api/lead-forms/:id` - Update lead form (admin only)
- `DELETE /api/lead-forms/:id` - Delete lead form (admin only)
- `GET /api/lead-forms/stats/dashboard` - Get lead form statistics

### Default Users (After seeding)

**Admin User:**
- Email: admin@unicall.com
- Password: admin123

**Regular Users:**
- Email: user1@unicall.com - user4@unicall.com
- Password: user123

### Role-Based Access Control

#### Admin Role:
- Can see all users' clients
- Can add/edit/delete lead forms
- Can add/edit/delete users
- Cannot create clients (business rule)

#### User Role:
- Can only see their own clients
- Can create/edit/delete their own clients
- Can view all lead forms (read-only)
- Cannot manage users

### Database Models

#### User Model
- name, email, password, role (user/admin), avatar, isActive

#### Client Model
- firstName, lastName, email, phone, address, city, state, zipCode, bank, status, createdBy

#### Lead Form Model
- title, description, category, priority, status, assignee, dueDate, clientInfo, uploadedFiles, integrations, createdBy

### File Uploads
Lead forms support file uploads up to 5MB. Supported formats:
- Images: JPEG, PNG
- Documents: PDF, DOC, DOCX, TXT

### Error Handling
All API responses follow this format:
```json
{
  "success": true/false,
  "message": "Description",
  "data": { ... },
  "errors": [ ... ] // Only on validation errors
}
```
