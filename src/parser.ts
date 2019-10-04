import { Dictionary, Item, List, ListItem, Parameters } from './types';

export default class Parser {

  input: string;
  position: number;

  constructor(input: string) {

    this.input = input;
    this.position = 0;
    this.skipOWS();

  }

  parseDictionary(): Dictionary {

    const output: Dictionary = {};

    while (!this.eol()) {

      // Dictionary key
      const key = this.parseKey();
      if (output[key] !== undefined) {
        throw new Error('Duplicate key in dictionary: ' + key);
      }

      // Equals sign
      this.matchByte('=');

      const value = this.parseParameterizedMember();
      output[key] = value;

      // Optional whitespace
      this.skipOWS();

      // Exit if at end of string
      if (this.eol()) {
        return output;
      }

      // Comma for separating values
      this.matchByte(',');

      // Optional whitespace
      this.skipOWS();

      if (this.eol()) {
        throw new Error('Unexpected end of string');
      }

    }
    return output;

  }

  parseList(): List {

    const output: List = [];
    while (!this.eol()) {

      output.push(this.parseParameterizedMember());
      this.skipOWS();
      if (this.eol()) {
        break;
      }
      this.matchByte(',');

      this.skipOWS();

      if (this.eol()) {
        throw new Error('Unexpected end of string. Was there a trailing comma?');
      }
    }

    return output;

  }

  /**
   * Parses a header as "item".
   */
  parseItem(): Item {

    this.skipOWS();
    const r = this.parseItemStr();
    this.end();
    return r;

  }


  private parseParameterizedMember(): ListItem {

    let value;
    if (this.input[this.position] === '(') {
      value = this.parseInnerList();
    } else {
      value = this.parseItemStr();
    }
    const parameters: Parameters = {};

    while (!this.eol()) {
      this.skipOWS();
      if (this.input[this.position] !== ';') {
        break;
      }
      this.getByte();
      this.skipOWS();
      const paramKey = this.parseKey();
      if (paramKey in parameters) {
        throw new Error('Duplicate parameter key: ' + paramKey);
      }
      let paramValue = null;
      if (this.input[this.position] === '=') {
        this.getByte();
        paramValue = this.parseItemStr();
      }
      parameters[paramKey] = paramValue;
    }
    return {
      value,
      parameters
    };

  }

  private parseInnerList(): Item[] {

    this.matchByte('(');
    const result: Item[] = [];

    while (!this.eol()) {

      this.skipOWS();

      if (this.input[this.position] === ')') {
        this.getByte();
        break;
      }
      result.push(this.parseItemStr());
      if (this.input[this.position] !== ' ' && this.input[this.position] !== ')') {
        throw new Error('Malformed list. Expected whitespace or )');
      }
    }

    return result;

  }

  /**
   * Parses an "item" part from a header.
   *
   * This function is used for parsing items that are a component of other
   * headers.
   *
   * If you are parsing an entire header, which should only contain a single
   * item, use parseItem() instead.
   */
  parseItemStr(): Item {

    const c = this.input[this.position];
    if (c === '"') {
      return this.parseString();
    }
    if (c === '*') {
      return this.parseByteSequence();
    }
    if (c === '?') {
      return this.parseBoolean();
    }
    if (c.match(/[0-9\-]/)) {
      return this.parseNumber();
    }
    if (c.match(/[a-zA-Z]/)) {
      return this.parseToken();
    }

    throw new Error('Unexpected character: ' + c + ' on position ' + this.position);

  }


  parseNumber(): number {

    const match = this.input.substr(
      this.position
    ).match(/[0-9\-]([0-9])*(\.[0-9]{1,6})?/);
    this.position += match[0].length;
    if (match[0].indexOf('.') !== -1) {
      return parseFloat(match[0]);
    } else {
      if (match[0].length > 16 || (match[0][0] !== '-' && match[0].length > 15)) {
        throw Error('Integers must not have more than 15 digits.' + match[0].length);
      }
      return parseInt(match[0], 10);
    }

  }

  parseString(): string {

    let output = '';
    this.position++;
    while (true) {

      const c = this.getByte();
      switch (c) {

        case '\\' :
          const c2 = this.getByte();
          if (c2 !== '"' && c2 !== '\\') {
            throw new Error('Expected a " or \\ on position: ' + (this.position - 1));
          }
          output += c2;
          break;
        case '"' :
          return output;
        default :
          if (c < ' ' || c > '~') {
            throw new Error('Character outside of ASCII range');
          }
          output += c;
          break;
      }

    }

  }

  /**
   * Tokens are parsed as strings.
   *
   * They are a possible 'item'. If the string contains characters outside
   * the token list, it should be enclosed in double-quotes and serialized
   * as a 'string' instead of 'token'
   */
  parseToken(): string {

    const identifierRegex = /^[a-zA-Z][a-zA-Z0-9_\-\.\:\%\*\/]*/;
    const result = this.input.substr(this.position).match(identifierRegex);
    if (!result) {
      throw Error('Expected identifier at position: ' + this.position);
    }
    this.position += result[0].length;
    return result[0];

  }

  /**
   * Keys are used both in Dictionary and ParamList.
   */
  parseKey(): string {

    const identifierRegex = /^[a-z][a-z0-9_\-\*]{0,254}/;
    const result = this.input.substr(this.position).match(identifierRegex);
    if (!result) {
      throw Error('Expected identifier at position: ' + this.position);
    }
    this.position += result[0].length;
    return result[0];

  }

  parseByteSequence(): Buffer {

    this.matchByte('*');
    const result = this.input.substr(this.position).match(/^([A-Za-z0-9\\+\\/=]*)\*/);
    if (!result) {
      throw new Error('Couldn\'t parse byte sequence');
    }
    if (result[1].length % 4 !== 0) {
      throw new Error('Base64 strings should always have a length that\'s a multiple of 4. Did you forget padding?');
    }
    this.position += result[0].length;

    return Buffer.from(result[1], 'base64');

  }

  parseBoolean(): boolean {

    this.matchByte('?');
    const c = this.getByte();
    let result;
    switch (c) {
      case '0' :
        result = false;
        break;
      case '1' :
        result = true;
        break;
      default:
        throw new Error('A "?" must be followed by "0" or "1"');
    }

    return result;

  }

  // Advances the pointer to skip all whitespace.
  skipOWS(): void {

    while (true) {
      const c = this.input.substr(this.position, 1);
      if (c === ' ' || c === '\t') {
        this.position++;
      } else {
        break;
      }
    }

  }

  // Eats up any whitespace and ensures that there's nothing left at the end
  // of the string.
  end(): void {

    this.skipOWS();
    if (!this.eol()) {
      throw new Error('Expected end of the string, but found more data instead');
    }

  }

  // Advances the pointer 1 position and returns a byte.
  getByte(): string {

    const c = this.input[this.position];
    if (c === undefined) {
      throw new Error('Unexpected end of string');
    }
    this.position++;
    return c;

  }

  // Grabs 1 byte from the stream and makes sure it matches the specified
  // character.
  matchByte(match: string): void {

    const c = this.getByte();
    if (c !== match) {
      throw new Error('Expected ' + match + ' on position ' + (this.position - 1));
    }

  }

  // Returns true if we're at the end of the line.
  eol(): boolean {

    return this.position === this.input.length;

  }

}

module.exports = Parser;
