import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUI from 'swagger-ui-express';

const options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'Orluncoin APIs',
			version: '1.0.0',
			description: 'APIs for the Orluncoin',
			contact: {
				name: 'Pathum Senanayake',
				email: 'pathumsenanayake@proton.me',
				url: 'https://github.com/Pathum312',
			},
		},
		servers: [
			{
				url: 'http://localhost:3000',
				description: 'Local Server',
			},
		],
	},
	apis: ['./src/containers/*.ts'],
};

const specs = swaggerJsDoc(options);

export { specs, swaggerUI };
