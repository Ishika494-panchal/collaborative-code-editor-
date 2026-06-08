import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { config } from '../config';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  errorMessage = '';

  constructor() {
    // Check for error query params
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'auth_error') {
      this.errorMessage = 'Authentication failed. Please try again.';
    } else if (error === 'auth_failed') {
      this.errorMessage = 'GitHub login was cancelled or failed. Please try again.';
    }
  }

  loginWithGithub() {
    window.location.href = `${config.apiUrl}/auth/github`;
  }
}
