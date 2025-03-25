'use server';

import { signIn } from 'next-auth/react';
import { pool } from '../lib/db'; // Assuming you have a PostgreSQL pool setup

export async function register(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  console.log('Register action called with data:', { email, password });

  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.log('User already exists');
      return { error: 'User already exists' };
    }

    // Create the user in the database
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, password]
    );
    const newUser = result.rows[0];
    console.log('User created:', newUser);

    // Sign the user in to set the session
    const signInResult = await signIn('credentials', {
      email,
      password,
      redirect: false, // Handle redirect manually
    });

    console.log('Sign-in result after registration:', signInResult);

    if (signInResult?.error) {
      console.log('Sign-in error after registration:', signInResult.error);
      return { error: 'Failed to sign in after registration' };
    }

    console.log('Registration and sign-in successful');
    return { success: true };
  } catch (error) {
    console.error('Registration failed with error:', error);
    return { error: 'Registration failed' };
  }
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  console.log('Login action called with data:', { email, password });

  try {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    console.log('Sign-in result:', result);

    if (result?.error) {
      console.log('Sign-in error:', result.error);
      return { error: result.error };
    }

    console.log('Sign-in successful');
    return { success: true };
  } catch (error) {
    console.log('Sign-in failed with error:', error);
    return { error: 'Invalid credentials' };
  }
}