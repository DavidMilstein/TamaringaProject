import { Component, OnInit } from '@angular/core';
import {NgForm} from '@angular/forms';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  // we know we get the form object which is of type ngForm.

  // onLogin(form: NgForm) {
  //   // you can console log form value for example to output the values entered by the user.
  //   console.log(form.value);
  // }



  constructor() { }

  ngOnInit() {
  }

}
