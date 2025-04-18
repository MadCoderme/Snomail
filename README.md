# Snomail

Snomail is a modern cold email automation platform built with modern web technologies. It allows you to create, manage, and automate personalized email sequences for your outreach campaigns.

## Features

- **Email Sequence Builder**: Create multi-step email sequences with customizable delays
- **Campaign Management**: Run multiple campaigns with different sequences and SMTP settings
- **Contact Management**: Handle large lists of recipients with custom fields for personalization
- **Template Personalization**: Use dynamic placeholders like {firstName}, {company}, etc.
- **Rich Text Editor**: Format your emails with a built-in WYSIWYG editor
- **Campaign Analytics**: Track delivery, progress, and errors for each contact
- **Campaign Controls**: Start, pause, and monitor campaign progress

## Tech Stack

### Frontend
- Vue 3 with Nuxt.js
- Shadcn UI components
- TipTap rich text editor
- TypeScript

### Backend
- Bun runtime
- Elysia.js web framework
- PostgreSQL database
- Node-schedule for job scheduling
- Nodemailer for email delivery

## Getting Started

### Prerequisites
- Node.js 16+ or Bun 1.0+
- PostgreSQL 12+
- SMTP server access

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
bun install
```

3. Set up your PostgreSQL database and run the setup script:
```bash
psql -d your_database -f setup.sql
```

4. Configure environment variables:
```bash
# Create .env file
DATABASE_URL=postgres://user:pass@localhost:5432/your_database
FRONTEND_URL=http://localhost:3000
```

5. Start the backend server:
```bash
bun run index.ts
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd ..  # If in backend directory
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
```

## Usage

1. Create email sequences with multiple steps and delays
2. Configure SMTP settings for your email delivery
3. Create a campaign using your sequence
4. Add recipients with personalization data
5. Start the campaign and monitor progress

## Security Notes

- Store SMTP credentials securely in production
- Use environment variables for sensitive data
- Follow email compliance regulations

## Todo

- [ ] Clean up AI generated code
- [ ] Add rate limiting for email sending
- [ ] Implement email bounce handling
- [ ] Add A/B testing for email templates
- [ ] Create API documentation
- [ ] Add support for multiple SMTP providers
- [ ] Implement email template version control
- [ ] Add campaign performance analytics dashboard
- [ ] Add CSV contact import

## License

MIT License

## Contributing

Contributions are welcome! If you want to develop a cloud-hosted platform based on Snomail, you may reach out to @Madcoderme for support.

## Support

For support, please open an issue on GitHub or contact the maintainers.