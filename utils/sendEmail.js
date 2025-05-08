const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true, // Use connection pooling
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

exports.sendOtpToEmail = async (email, otp) => {

  const mailOptions = {
    from: 'YOKE 👨‍💻 <no-reply@yoke.com>',
    to: email,
    subject: 'OTP Verification - YOKE',
    text: `Your OTP is ${otp}. It is valid for 10 minutes.`,
  };

  await transporter.sendMail(mailOptions);
};
exports.sendBookingConfirmationEmail = async (email, booking, trip) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Booking Confirmed',
      html: `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>Booking #${booking._id}</h2>
          <p>Trip: ${trip.tripName}</p>
          <p>People: ${booking.numPeople}</p>
          <p>Amount: $${booking.totalAmount}</p>
        </div>
      `,
      // Add text version for faster processing
      text: `Booking #${booking._id}\nTrip: ${trip.tripName}\nPeople: ${booking.numPeople}\nAmount: $${booking.totalAmount}`
    };

    // Don't wait for response
    transporter.sendMail(mailOptions)
      .then(info => console.log('Email sent:', info.messageId))
      .catch(err => console.error('Email error:', err));
    
  } catch (error) {
    console.error('Email processing error:', error);
  }
};
exports.sendBookingCancellationEmail = async (email, booking, trip) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Booking Cancelled',
    html: `
      <div style="font-family: Arial; max-width: 600px;">
        <h2>Booking Cancelled: #${booking._id}</h2>
        <p><strong>Trip:</strong> ${trip.tripName}</p>
        <p><strong>Start Date:</strong> ${new Date(trip.startTime).toLocaleDateString('en-IN')}</p>
        <p><strong>People:</strong> ${booking.numPeople}</p>
        <p><strong>Refund Amount:</strong> ₹${booking.totalAmount}</p>
        <p style="margin-top: 20px;">We're sorry to see you cancel. If you have any questions, feel free to contact us.</p>
      </div>
    `,
    text: `Booking Cancelled: #${booking._id}\nTrip: ${trip.tripName}\nStart Date: ${new Date(trip.startTime).toLocaleDateString('en-IN')}\nPeople: ${booking.numPeople}\nRefund Amount: ₹${booking.totalAmount}`
  };

  transporter.sendMail(mailOptions)
    .then(info => console.log('Cancellation Email sent:', info.messageId))
    .catch(err => console.error('Cancellation Email error:', err));
};

