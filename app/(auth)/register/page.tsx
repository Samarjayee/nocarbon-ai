'use client';

import { useState } from 'react';
import { register } from '../actions';

interface SearchParams {
  callbackUrl?: string;
}

export default function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const [error, setError] = useState<string | null>(null); | null>(null);
  const callbackUrl = searchParams.callbackUrl || '/';

  console.log('Register page loaded with callbackUrl:', callbackUrl);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {TMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);;

    console.log('Submitting register form');Submitting register form');
    const result = await register(formData);

    console.log('Register result:', result);ole.log('Register result:', result);

    if (result?.error) { (result?.error) {
      console.log('Setting error:', result.error);
      setError(result.error);      setError(result.error);
    } else {
      console.log('Registration successful, redirecting to:', callbackUrl);      console.log('Registration successful, redirecting to:', callbackUrl);
      window.location.href = callbackUrl; // Force redirectef = callbackUrl; // Force redirect
    }
  };

  return (
    <div>
      <h1>Register</h1> <h1>Register</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}  {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>      <form onSubmit={handleSubmit}>
        <div>iv>
          <label htmlFor="email">Email:</label> <label htmlFor="email">Email:</label>
          <input type="email" id="email" name="email" required />email" id="email" name="email" required />
        </div>
        <div>
          <label htmlFor="password">Password:</label>bel htmlFor="password">Password:</label>
          <input type="password" id="password" name="password" required />name="password" required />
        </div>
        <button type="submit">Register</button>n type="submit">Register</button>
      </form>
    </div>
  );
}