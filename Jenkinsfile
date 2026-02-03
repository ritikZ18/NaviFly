pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "my-registry.local"
        APP_NAME = "navifly-routing"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Lint & Test') {
            parallel {
                stage('Go Services') {
                    steps {
                        dir('services/routing-go') {
                            // sh 'go test -v ./...'
                            echo "Running Go tests..."
                        }
                    }
                }
                stage('Python Analytics') {
                    steps {
                        dir('analytics/python') {
                            // sh 'pytest'
                            echo "Running Python tests..."
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('ui/react-headunit') {
                            sh 'npm install'
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        stage('Build & Push Images') {
            steps {
                script {
                    // docker.withRegistry("https://${DOCKER_REGISTRY}") {
                    //     def routingImg = docker.build("${APP_NAME}:${env.BUILD_ID}", "./services/routing-go")
                    //     routingImg.push()
                    // }
                    echo "Building Docker images..."
                }
            }
        }

        stage('Deploy to K8s') {
            steps {
                // sh "helm upgrade --install navifly ./infra/helm --set image.tag=${env.BUILD_ID}"
                echo "Deploying to Kubernetes..."
            }
        }

        stage('Smoke Test') {
            steps {
                // sh "curl -f http://navifly.local/health"
                echo "Running smoke tests..."
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo "Deployment successful!"
        }
        failure {
            echo "Pipeline failed. Check logs."
        }
    }
}
