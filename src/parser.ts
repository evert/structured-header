type Item = string | number | Buffer;

type Dictionary = {
  [s: string]: Item
};

type List = Item[];

type ParameterizedIdentifier = [string, Dictionary];
type ParameterizedList = ParameterizedIdentifier[];


class Parser {

  input: string;
  position: number;

  constructor(input: string) {

    this.input = input;
    this.position = 0;
    this.skipOWS();

  }

  parseDictionary(): Dictionary {

    const output: Dictionary = {};

    while (true) {

      // Dictionary key
      const key = this.parseIdentifier();
      if (output[key] !== undefined) {
        throw new Error('Duplicate key in dictionary: ' + key);
      }

      // Equals sign
      this.matchByte('=');

      // Value
      const value = this.parseItem();
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

  }

  parseList(): List {

    const output = [];

    while (!this.eol()) {

      // Get item
      const value = this.parseItem();
      output.push(value);

      // Whitespace
      this.skipOWS();

      if (this.eol()) {
        return output;
      }

      // Grab a comma
      this.matchByte(',');

      // Whitespace
      this.skipOWS();

    }
    throw new Error('Unexpected end of string');

  }


  parseParameterizedList(): ParameterizedList {

    const output = [];
    while (!this.eol()) {

      // Parse item
      output.push(this.parseParameterizedIdentifier());

      // Whitespace
      this.skipOWS();

      if (this.eol()) {
        return output;
      }

      this.matchByte(',');
      this.skipOWS();

    }
    throw new Error('Unexpected end of string');

  }

  parseParameterizedIdentifier(): ParameterizedIdentifier {

    const identifier = this.parseIdentifier();
    const parameters: Dictionary = {};

    while (true) {

      // Whitespace
      this.skipOWS();

      // Stop if parameter didn't start with ;
      if (this.input[this.position] !== ';') {
        break;
      }
      this.position++;

      // Whitespace
      this.skipOWS();

      const paramName = this.parseIdentifier();
      let paramValue = null;

      // If there's an =, there's a value
      if (this.input[this.position] === '=') {
        this.position++;
        paramValue = this.parseItem();
      }

      parameters[paramName] = paramValue;

    }

    return [identifier, parameters];

  }

  parseItem(): Item {

    this.skipOWS();
    const c = this.input[this.position];
    if (c === '"') {
      return this.parseString();
    }
    if (c === '*') {
      return this.parseBinary();
    }
    if (c.match(/[0-9\-]/)) {
      return this.parseNumber();
    }
    if (c.match(/[a-z]/)) {
      return this.parseIdentifier();
    }

    throw new Error('Unexpected character: ' + c + ' on position ' + this.position);

  }

  parseNumber(): number {

    const match = this.input.substr(
      this.position
    ).match(/[0-9\-][0-9\.]*/);
    this.position += match[0].length;
    if (match[0].indexOf('.') !== -1) {
      return parseFloat(match[0]);
    } else {
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
          output += c;
          break;
      }

    }

  }

  parseIdentifier(): string {

    const identifierRegex = /^[a-z][a-z0-9_\-\*\/]{0,254}/;
    const result = this.input.substr(this.position).match(identifierRegex);
    if (!result) {
      throw Error('Expected identifier at position: ' + this.position);
    }
    this.position += result[0].length;
    return result[0];

  }

  parseBinary(): Buffer {

    this.matchByte('*');
    const result = this.input.substr(this.position).match(/^([A-Za-z0-9\\+\\/=]*)\*/);
    if (!result) {
      throw new Error('Couldn\'t parse binary item');
    }
    if (result[1].length % 4 !== 0) {
      throw new Error('Base64 strings should always have a length that\'s a multiple of 4. Did you forget padding?');
    }
    this.position += result[0].length;

    return Buffer.from(result[1], 'base64');

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