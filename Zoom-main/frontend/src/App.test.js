import { render, screen } from '@testing-library/react';
import App from './App';

test('renders landing page content', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /connect with your loved ones/i });
  expect(heading).toBeInTheDocument();
});
