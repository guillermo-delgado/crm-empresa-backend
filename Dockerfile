FROM node:20-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    tesseract-ocr \
    tesseract-ocr-spa \
    tesseract-ocr-eng \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY python-requirements/requirements.txt ./
RUN python3 -m pip install --break-system-packages -r requirements.txt

COPY . .

RUN npm run build

ENV PYTHON_COMMAND=python3

CMD ["npm", "start"]