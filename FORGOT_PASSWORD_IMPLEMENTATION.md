# Forgot Password Implementation - OTP Based

## Overview
A complete "Forgot Password" feature has been implemented using Email OTP (One-Time Password) for the Shoezy e-commerce project. This implementation follows security best practices and provides a seamless user experience.

## Features Implemented

### 1. Backend Routes & Controllers
- **GET /forgot-password** - Display email input form
- **POST /forgot-password** - Validate email, generate OTP, send email
- **GET /verify-reset-otp** - Display OTP verification form
- **POST /verify-reset-otp** - Verify entered OTP
- **GET /reset-password** - Display password reset form (only after OTP verified)
- **POST /reset-password** - Update password securely

### 2. Security Features
- **OTP Expiry**: 5-minute expiration for OTP
- **Session Management**: OTP stored securely in session
- **Password Hashing**: bcrypt used for password hashing
- **Input Validation**: Both client-side and server-side validation
- **Access Control**: Reset password only accessible after OTP verification

### 3. Frontend Features
- **Clean EJS Templates**: 
  - `forgot-password.ejs` - Email input form
  - `verify-reset-otp.ejs` - OTP verification with timer
  - `reset-password.ejs` - Password reset form
- **Real-time Validation**: Vanilla JavaScript validation
- **SweetAlert2 Integration**: Beautiful success/error messages
- **Responsive Design**: Mobile-friendly interface
- **Timer Display**: Visual countdown for OTP expiry

### 4. Email Integration
- **Nodemailer**: Professional email templates
- **HTML Email**: Styled email with OTP display
- **Error Handling**: Graceful email sending failure handling

## File Structure

### Controllers
- `controllers/user/userController.js` - Updated with OTP-based functions

### Routes
- `routes/userRouter.js` - Added forgot password routes

### Views
- `views/user/forgot-password.ejs` - Email input form
- `views/user/verify-reset-otp.ejs` - OTP verification form
- `views/user/reset-password.ejs` - Password reset form

### Styles
- `public/css/resetpass.css` - Styling for reset password pages

## How It Works

### Step 1: Request Password Reset
1. User clicks "Forgot password?" on login page
2. User enters registered email address
3. System validates email and checks if user exists
4. 6-digit OTP generated and sent to email
5. OTP stored in session with 5-minute expiry

### Step 2: Verify OTP
1. User redirected to OTP verification page
2. Timer shows remaining time (5 minutes)
3. User enters 6-digit OTP
4. System validates OTP and marks session as verified

### Step 3: Reset Password
1. User redirected to password reset form
2. User enters new password (minimum 6 characters)
3. Password confirmation required
4. Password hashed and updated in database
5. Session cleared and user redirected to login

## Security Measures

1. **OTP Expiry**: 5-minute window prevents replay attacks
2. **Session-based Storage**: OTP stored in server session, not client
3. **Access Control**: Each step requires previous step completion
4. **Input Sanitization**: All inputs validated and sanitized
5. **Password Hashing**: bcrypt with salt rounds for secure storage
6. **Rate Limiting**: Natural rate limiting through session management

## Validation Rules

### Email Validation
- Required field
- Valid email format
- Must exist in database

### OTP Validation
- Required field
- Exactly 6 digits
- Must match session OTP
- Must not be expired

### Password Validation
- Required field
- Minimum 6 characters
- Must match confirmation password

## Error Handling

- **Network Errors**: Graceful handling with user-friendly messages
- **Validation Errors**: Real-time feedback with specific error messages
- **Session Expiry**: Automatic redirection with clear messaging
- **Email Failures**: Fallback handling with retry options

## Integration Notes

- **No Existing Code Modified**: All existing routes and functionality preserved
- **Session Compatibility**: Uses existing session configuration
- **Email Configuration**: Uses existing Nodemailer setup
- **Database Schema**: No changes required to existing user schema

## Testing

The implementation can be tested by:
1. Starting the server: `npm start`
2. Navigating to `/login`
3. Clicking "Forgot password?"
4. Following the complete flow

## Environment Variables Required

Ensure these are set in your `.env` file:
- `NODEMAILER_EMAIL` - Gmail address for sending emails
- `NODEMAILER_PASSWORD` - Gmail app password
- `SESSION_SECRET` - Session encryption key

## Production Considerations

1. Remove console.log statements showing OTP in production
2. Consider implementing rate limiting for OTP requests
3. Add email template customization
4. Consider SMS OTP as alternative option
5. Add audit logging for security events

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- JavaScript ES6+ features used
- SweetAlert2 for cross-browser alerts

This implementation provides a secure, user-friendly, and professional forgot password system that integrates seamlessly with the existing Shoezy e-commerce platform.